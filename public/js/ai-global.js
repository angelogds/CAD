(function () {
  const root = document.getElementById('aiGlobalVoice');
  const button = document.getElementById('aiGlobalLauncher');
  const greetingEl = document.getElementById('aiGlobalVoiceGreeting');
  const statusEl = document.getElementById('aiGlobalVoiceStatus');
  const remoteAudio = document.getElementById('aiGlobalVoiceAudio');
  if (!root || !button || !greetingEl || !statusEl || !remoteAudio) return;

  // A página completa do Assistente já possui seu próprio controle de voz.
  // Evita duas conexões Realtime concorrentes na mesma tela.
  if (window.location.pathname === '/ai/chat') {
    root.hidden = true;
    return;
  }

  const sourceRoute = `${window.location.pathname}${window.location.search}`;
  const conversationStorageKey = 'cg_ai_industrial_conversation_id_v1';
  let conversationId = sessionStorage.getItem(conversationStorageKey) || '';
  if (!conversationId) {
    conversationId = window.crypto?.randomUUID?.() || `voice-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(conversationStorageKey, conversationId);
  }

  const fullName = String(root.dataset.userName || 'Usuário').trim().slice(0, 80) || 'Usuário';
  const firstName = fullName.split(/\s+/)[0] || fullName;
  let pc = null;
  let dc = null;
  let localStream = null;
  let active = false;
  let starting = false;
  let validatedContext = null;
  let greetingInProgress = false;
  let turnStartedAt = 0;
  let lastResponseLatencyMs = 0;
  const handledCalls = new Set();

  function greetingForHour(hour = new Date().getHours()) {
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function greetingText() {
    return `${greetingForHour()}, ${firstName}.`;
  }

  function setState(state, statusText, greeting) {
    root.dataset.state = state || 'idle';
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.setAttribute('aria-label', active ? 'Encerrar assistente por voz' : 'Iniciar assistente por voz');
    if (greeting !== undefined) greetingEl.textContent = String(greeting || 'Assistente por voz');
    if (statusText !== undefined) statusEl.textContent = String(statusText || '');
  }

  function setMicEnabled(enabled) {
    try {
      localStream?.getAudioTracks()?.forEach((track) => { track.enabled = Boolean(enabled); });
    } catch (_e) {}
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

  function startGreeting() {
    if (dc?.readyState !== 'open') return;
    const greeting = greetingText();
    greetingInProgress = true;
    setMicEnabled(false);
    setState('starting', 'Assistente por voz ativo', greeting);
    sendEvent({
      type: 'response.create',
      response: {
        instructions: `Diga somente esta saudação, de forma natural, clara e breve em português do Brasil: "${greeting} Assistente por voz ativo. Como posso ajudar?" Não consulte ferramentas e não acrescente outras informações nesta saudação.`,
      },
    });
  }

  async function runTool(call) {
    const callId = String(call?.call_id || call?.id || '');
    if (!callId || handledCalls.has(callId)) return;
    handledCalls.add(callId);
    setState('thinking', `Consultando sistema: ${call.name || 'ferramenta'}...`, greetingText());

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
      output = response.ok
        ? data.result
        : { error: data?.error || 'Falha ao consultar sistema.', code: data?.code || 'AI_TOOL_ERROR' };
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

  function finishGreeting() {
    if (!greetingInProgress) return;
    greetingInProgress = false;
    setMicEnabled(true);
    setState('listening', 'Ouvindo... fale normalmente', greetingText());
  }

  function handleServerEvent(event) {
    const type = String(event?.type || '');

    if (type === 'input_audio_buffer.speech_started' && !greetingInProgress) {
      turnStartedAt = 0;
      lastResponseLatencyMs = 0;
      setState('listening', 'Ouvindo...', greetingText());
    }
    if (type === 'input_audio_buffer.speech_stopped' && !greetingInProgress) {
      turnStartedAt = performance.now();
      setState('thinking', 'Entendendo...', greetingText());
    }
    if (type === 'response.created') {
      setState(greetingInProgress ? 'starting' : 'thinking', greetingInProgress ? 'Cumprimentando...' : 'Respondendo...', greetingText());
    }
    if (type === 'output_audio_buffer.started' || type === 'response.output_audio.started') {
      if (turnStartedAt > 0 && !lastResponseLatencyMs) lastResponseLatencyMs = performance.now() - turnStartedAt;
      setState('speaking', greetingInProgress ? 'Assistente por voz ativo' : 'Falando...', greetingText());
    }
    if (type === 'output_audio_buffer.stopped') {
      if (greetingInProgress) finishGreeting();
      else if (active) setState('listening', 'Ouvindo... fale normalmente', greetingText());
    }

    if (type === 'response.function_call_arguments.done') {
      runTool({ call_id: event.call_id, name: event.name, arguments: event.arguments });
    }
    if (type === 'response.output_item.done' && event?.item?.type === 'function_call') {
      runTool(event.item);
    }
    if (type === 'response.done') {
      reportRealtimeUsage(event?.response?.usage, lastResponseLatencyMs);
      if (!greetingInProgress && active) setState('listening', 'Ouvindo... fale normalmente', greetingText());
    }
    if (type === 'error') {
      const message = event?.error?.message || 'Erro na sessão de voz.';
      greetingInProgress = false;
      setMicEnabled(true);
      setState('error', message, 'Assistente indisponível');
    }
  }

  function validSdp(value) {
    const sdp = String(value || '');
    return sdp.startsWith('v=0') && sdp.includes('\nm=');
  }

  function teardownVoice() {
    active = false;
    starting = false;
    greetingInProgress = false;
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
    button.disabled = false;
  }

  async function startVoice() {
    if (starting || active) return;
    if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Este navegador não suporta voz WebRTC.');
    }

    starting = true;
    button.disabled = true;
    setState('starting', 'Validando contexto...', greetingText());
    await loadValidatedContext();
    setState('starting', 'Solicitando microfone...', greetingText());

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
      if (state === 'failed') {
        teardownVoice();
        setState('error', 'Falha na conexão de voz. Toque para tentar novamente.', 'Assistente indisponível');
      }
      if (state === 'disconnected' && active) {
        setState('thinking', 'Reconectando voz...', greetingText());
      }
    };

    dc = pc.createDataChannel('oai-events');
    dc.onopen = () => {
      injectValidatedContext();
      startGreeting();
    };
    dc.onmessage = (message) => {
      try { handleServerEvent(JSON.parse(message.data)); } catch (_e) {}
    };
    dc.onclose = () => {
      if (active) setState('error', 'Conexão de voz encerrada. Toque para iniciar novamente.', 'Assistente por voz');
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const localSdp = String(pc.localDescription?.sdp || offer.sdp || '');
    if (!validSdp(localSdp)) throw new Error('O navegador não gerou uma oferta SDP válida para a sessão de voz.');

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
    if (!validSdp(answerBody)) throw new Error('O servidor de voz não retornou uma resposta SDP válida.');

    await pc.setRemoteDescription({ type: 'answer', sdp: answerBody });
    active = true;
    starting = false;
    button.disabled = false;
    button.setAttribute('aria-pressed', 'true');
  }

  function stopVoice() {
    teardownVoice();
    setState('idle', 'Pronto para conversar', 'Assistente por voz');
    button.focus();
  }

  button.addEventListener('click', async () => {
    if (active) return stopVoice();
    if (starting) return;
    try {
      await startVoice();
    } catch (err) {
      teardownVoice();
      setState('error', err?.message || 'Falha ao iniciar voz.', 'Assistente indisponível');
    }
  });

  window.addEventListener('beforeunload', teardownVoice);
})();
