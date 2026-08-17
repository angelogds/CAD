(function () {
  const button = document.getElementById('voiceToggle');
  const statusEl = document.getElementById('voiceStatus');
  const transcriptEl = document.getElementById('voiceTranscript');
  const remoteAudio = document.getElementById('voiceRemoteAudio');
  if (!button || !statusEl || !transcriptEl || !remoteAudio) return;

  function safeInternalPath(value) {
    const raw = String(value || '').trim();
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
    try {
      const url = new URL(raw, window.location.origin);
      if (url.origin !== window.location.origin) return null;
      return `${url.pathname}${url.search}`.slice(0, 700);
    } catch (_e) {
      return null;
    }
  }

  const sourceParam = new URLSearchParams(window.location.search).get('source');
  const sourceRoute = safeInternalPath(sourceParam) || '/ai/chat';
  const conversationStorageKey = 'cg_ai_industrial_conversation_id_v1';
  let conversationId = sessionStorage.getItem(conversationStorageKey) || '';
  if (!conversationId) {
    conversationId = window.crypto?.randomUUID?.() || `voice-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(conversationStorageKey, conversationId);
  }

  let pc = null;
  let dc = null;
  let localStream = null;
  let active = false;
  let validatedContext = null;
  let turnStartedAt = 0;
  let lastResponseLatencyMs = 0;
  const handledCalls = new Set();
  const transcriptLines = [];

  function setStatus(text) {
    statusEl.textContent = String(text || '');
  }

  function addTranscript(author, text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    transcriptLines.push(`${author}: ${clean}`);
    if (transcriptLines.length > 30) transcriptLines.splice(0, transcriptLines.length - 30);
    transcriptEl.textContent = transcriptLines.join('\n\n');
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }

  function sendEvent(payload) {
    if (dc?.readyState === 'open') dc.send(JSON.stringify(payload));
  }

  function reportRealtimeUsage(usage, latencyMs) {
    if (!usage || typeof usage !== 'object') return;
    fetch('/ai/realtime/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        conversation_id: conversationId,
        latency_ms: Math.max(0, Math.round(Number(latencyMs || 0))),
        usage,
      }),
      keepalive: true,
    }).catch(() => {});
  }

  async function loadValidatedContext() {
    try {
      const response = await fetch(`/ai/industrial/context?route=${encodeURIComponent(sourceRoute)}`, {
        headers: { Accept: 'application/json' },
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Falha ao validar contexto da página.');
      validatedContext = data.context || null;
      return validatedContext;
    } catch (_e) {
      validatedContext = null;
      return null;
    }
  }

  function injectValidatedContext() {
    if (!validatedContext || dc?.readyState !== 'open') return;
    const contextPayload = {
      module: validatedContext.module || 'geral',
      entity_type: validatedContext.entity_type || null,
      entity_id: Number(validatedContext.entity_id || 0) || null,
      label: validatedContext.label || 'Contexto geral',
      details: validatedContext.details && typeof validatedContext.details === 'object' ? validatedContext.details : {},
      conversation_id: conversationId,
    };
    sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_text',
          text: `Contexto de navegação validado pelo backend. Use somente como referência da página atual e continue usando as ferramentas para confirmar fatos operacionais. Não responda a esta mensagem isoladamente. Contexto: ${JSON.stringify(contextPayload)}`,
        }],
      },
    });
  }

  async function runTool(call) {
    const callId = String(call?.call_id || call?.id || '');
    if (!callId || handledCalls.has(callId)) return;
    handledCalls.add(callId);
    setStatus(`Consultando sistema: ${call.name || 'ferramenta'}...`);

    let args = {};
    try { args = JSON.parse(call.arguments || '{}'); } catch (_e) { args = {}; }

    const name = String(call?.name || '');
    if (name.startsWith('preparar_') && !args.conversation_id) args.conversation_id = conversationId;

    let output;
    try {
      const response = await fetch('/ai/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name, arguments: args }),
      });
      const data = await response.json();
      output = response.ok ? data.result : { error: data?.error || 'Falha ao consultar sistema.', code: data?.code || 'AI_TOOL_ERROR' };
    } catch (err) {
      output = { error: err?.message || 'Falha de rede ao executar ferramenta.', code: 'AI_TOOL_NETWORK_ERROR' };
    }

    sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(output),
      },
    });
    sendEvent({ type: 'response.create' });
  }

  function handleServerEvent(event) {
    const type = String(event?.type || '');
    if (type === 'input_audio_buffer.speech_started') {
      turnStartedAt = 0;
      lastResponseLatencyMs = 0;
      setStatus('Ouvindo...');
    }
    if (type === 'input_audio_buffer.speech_stopped') {
      turnStartedAt = performance.now();
      setStatus('Entendendo...');
    }
    if (type === 'response.created') setStatus('Respondendo...');
    if (type === 'output_audio_buffer.started' || type === 'response.output_audio.started') {
      if (turnStartedAt > 0 && !lastResponseLatencyMs) lastResponseLatencyMs = performance.now() - turnStartedAt;
      setStatus('Falando...');
    }
    if (type === 'output_audio_buffer.stopped') setStatus(active ? 'Ouvindo...' : 'Pronto para conversar');

    if (type === 'conversation.item.input_audio_transcription.completed') {
      addTranscript('Você', event.transcript);
    }
    if (type === 'response.output_audio_transcript.done') {
      addTranscript('Assistente', event.transcript);
    }

    if (type === 'response.function_call_arguments.done') {
      runTool({ call_id: event.call_id, name: event.name, arguments: event.arguments });
    }
    if (type === 'response.output_item.done' && event?.item?.type === 'function_call') {
      runTool(event.item);
    }
    if (type === 'response.done') {
      reportRealtimeUsage(event?.response?.usage, lastResponseLatencyMs);
      setStatus(active ? 'Ouvindo...' : 'Pronto para conversar');
    }
    if (type === 'error') {
      const message = event?.error?.message || 'Erro na sessão de voz.';
      addTranscript('Sistema', message);
      setStatus(message);
    }
  }

  function validSdp(value) {
    const sdp = String(value || '');
    return sdp.startsWith('v=0') && sdp.includes('\nm=');
  }

  async function startVoice() {
    if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Este navegador não suporta voz WebRTC.');
    }

    setStatus('Validando contexto...');
    await loadValidatedContext();
    setStatus('Solicitando microfone...');
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    pc = new RTCPeerConnection();
    localStream.getAudioTracks().forEach((track) => pc.addTrack(track, localStream));

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      remoteAudio.srcObject = stream;
      remoteAudio.autoplay = true;
      remoteAudio.play().catch(() => {});
    };

    pc.onconnectionstatechange = () => {
      const state = pc?.connectionState;
      if (state === 'connected') setStatus('Ouvindo...');
      if (state === 'failed') setStatus('Falha na conexão de voz.');
      if (state === 'disconnected' && active) setStatus('Reconectando voz...');
    };

    dc = pc.createDataChannel('oai-events');
    dc.onopen = () => {
      injectValidatedContext();
      setStatus('Ouvindo... fale normalmente');
    };
    dc.onmessage = (message) => {
      try { handleServerEvent(JSON.parse(message.data)); } catch (_e) {}
    };
    dc.onclose = () => {
      if (active) setStatus('Conexão de voz encerrada.');
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const localSdp = String(pc.localDescription?.sdp || offer.sdp || '');
    if (!validSdp(localSdp)) {
      throw new Error('O navegador não gerou uma oferta SDP válida para a sessão de voz.');
    }

    const response = await fetch('/ai/realtime/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp', Accept: 'application/sdp, application/json' },
      body: localSdp,
    });
    const answerBody = await response.text();
    if (!response.ok) {
      let message = 'Não foi possível iniciar a voz.';
      try { message = JSON.parse(answerBody)?.error || message; } catch (_e) {}
      throw new Error(message);
    }
    if (!validSdp(answerBody)) {
      throw new Error('O servidor de voz não retornou uma resposta SDP válida.');
    }

    await pc.setRemoteDescription({ type: 'answer', sdp: answerBody });
    active = true;
    button.classList.add('active');
    button.textContent = '■';
    setStatus('Ouvindo... fale normalmente');
  }

  function stopVoice() {
    active = false;
    turnStartedAt = 0;
    lastResponseLatencyMs = 0;
    try { dc?.close(); } catch (_e) {}
    try { pc?.close(); } catch (_e) {}
    try { localStream?.getTracks()?.forEach((track) => track.stop()); } catch (_e) {}
    dc = null;
    pc = null;
    localStream = null;
    remoteAudio.pause();
    remoteAudio.srcObject = null;
    button.classList.remove('active');
    button.textContent = '🎙️';
    setStatus('Pronto para conversar');
  }

  button.addEventListener('click', async () => {
    if (active) return stopVoice();
    button.disabled = true;
    try {
      await startVoice();
    } catch (err) {
      stopVoice();
      setStatus(err?.message || 'Falha ao iniciar voz.');
      addTranscript('Sistema', err?.message || 'Falha ao iniciar voz.');
    } finally {
      button.disabled = false;
    }
  });

  window.addEventListener('beforeunload', stopVoice);
})();
