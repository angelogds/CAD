(function () {
  const tabs = Array.from(document.querySelectorAll('.assistant-tab'));
  const panels = {
    text: document.getElementById('panel-text'),
    voice: document.getElementById('panel-voice'),
  };
  const button = document.getElementById('voiceToggle');
  const statusEl = document.getElementById('voiceStatus');
  const transcriptEl = document.getElementById('voiceTranscript');
  const remoteAudio = document.getElementById('voiceRemoteAudio');
  if (!button || !statusEl || !transcriptEl || !remoteAudio) return;

  let pc = null;
  let dc = null;
  let localStream = null;
  let active = false;
  const handledCalls = new Set();
  const transcriptLines = [];

  tabs.forEach((tab) => tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    tabs.forEach((item) => item.classList.toggle('active', item === tab));
    Object.entries(panels).forEach(([key, panel]) => panel?.classList.toggle('active', key === target));
  }));

  function setStatus(text) {
    statusEl.textContent = text;
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

  async function runTool(call) {
    const callId = String(call?.call_id || call?.id || '');
    if (!callId || handledCalls.has(callId)) return;
    handledCalls.add(callId);
    setStatus(`Consultando sistema: ${call.name || 'ferramenta'}...`);

    let args = {};
    try { args = JSON.parse(call.arguments || '{}'); } catch (_e) { args = {}; }

    let output;
    try {
      const response = await fetch('/ai/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: call.name, arguments: args }),
      });
      const data = await response.json();
      output = response.ok ? data.result : { error: data?.error || 'Falha ao consultar sistema.' };
    } catch (err) {
      output = { error: err?.message || 'Falha de rede ao executar ferramenta.' };
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
    if (type === 'input_audio_buffer.speech_started') setStatus('Ouvindo...');
    if (type === 'input_audio_buffer.speech_stopped') setStatus('Entendendo...');
    if (type === 'response.created') setStatus('Respondendo...');
    if (type === 'response.output_audio.started') setStatus('Falando...');
    if (type === 'response.done') setStatus(active ? 'Ouvindo...' : 'Pronto para conversar');

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
    if (type === 'error') {
      const message = event?.error?.message || 'Erro na sessão de voz.';
      addTranscript('Sistema', message);
      setStatus(message);
    }
  }

  async function startVoice() {
    if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Este navegador não suporta voz WebRTC.');
    }

    setStatus('Solicitando microfone...');
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    pc = new RTCPeerConnection();
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) remoteAudio.srcObject = stream;
    };

    dc = pc.createDataChannel('oai-events');
    dc.onopen = () => setStatus('Ouvindo...');
    dc.onmessage = (message) => {
      try { handleServerEvent(JSON.parse(message.data)); } catch (_e) {}
    };
    dc.onclose = () => {
      if (active) setStatus('Conexão de voz encerrada.');
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const response = await fetch('/ai/realtime/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sdp: offer.sdp }),
    });
    const answerSdp = await response.text();
    if (!response.ok) {
      let message = 'Não foi possível iniciar a voz.';
      try { message = JSON.parse(answerSdp)?.error || message; } catch (_e) {}
      throw new Error(message);
    }
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    active = true;
    button.classList.add('active');
    button.textContent = '■';
    setStatus('Ouvindo...');
  }

  function stopVoice() {
    active = false;
    try { dc?.close(); } catch (_e) {}
    try { pc?.close(); } catch (_e) {}
    try { localStream?.getTracks()?.forEach((track) => track.stop()); } catch (_e) {}
    dc = null;
    pc = null;
    localStream = null;
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
