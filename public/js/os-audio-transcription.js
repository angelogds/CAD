(function () {
  const STATES = {
    idle: 'Pronto para gravar',
    recording: 'gravando',
    uploading: 'enviando',
    transcribing: 'transcrevendo',
    done: 'concluído',
    error: 'erro',
  };

  function setStatus(statusEl, value, message) {
    if (!statusEl) return;
    statusEl.textContent = message || STATES[value] || value;
    statusEl.dataset.state = value;
  }

  function appendText(target, text) {
    if (!target || !text) return;
    const current = String(target.value || '').trim();
    target.value = current ? `${current}\n${text}` : text;
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function initMicButton(btn) {
    const endpoint = btn.dataset.endpoint;
    const target = document.querySelector(btn.dataset.target);
    const statusEl = document.querySelector(btn.dataset.status);
    if (!endpoint || !target) return;

    let mediaRecorder = null;
    let stream = null;
    let chunks = [];
    let isRecording = false;

    async function stopRecordingAndSend() {
      if (!mediaRecorder || !isRecording) return;
      await new Promise((resolve) => {
        mediaRecorder.addEventListener('stop', resolve, { once: true });
        mediaRecorder.stop();
      });
      isRecording = false;
      btn.classList.remove('is-recording');
      btn.textContent = '🎤';
      setStatus(statusEl, 'uploading');

      const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
      chunks = [];
      const form = new FormData();
      form.append('audio', blob, `gravacao-${Date.now()}.webm`);

      try {
        setStatus(statusEl, 'transcribing');
        const response = await fetch(endpoint, { method: 'POST', body: form });
        const payload = await response.json();
        if (!response.ok || payload?.status === 'erro_validacao') {
          throw new Error(payload?.erro || 'Erro de validação do áudio');
        }
        if (payload?.status === 'concluido' && payload?.transcricao_bruta) {
          appendText(target, payload.transcricao_bruta);
          setStatus(statusEl, 'done');
          return;
        }
        setStatus(statusEl, 'error', payload?.erro || 'Sem transcrição automática. Continue manualmente.');
      } catch (err) {
        setStatus(statusEl, 'error', err?.message || 'Falha de transcrição. Continue manualmente.');
      }
    }

    btn.addEventListener('click', async () => {
      try {
        if (isRecording) {
          await stopRecordingAndSend();
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        chunks = [];
        mediaRecorder.addEventListener('dataavailable', (evt) => {
          if (evt.data && evt.data.size > 0) chunks.push(evt.data);
        });
        mediaRecorder.start();
        isRecording = true;
        btn.classList.add('is-recording');
        btn.textContent = '⏹️';
        setStatus(statusEl, 'recording');
      } catch (err) {
        setStatus(statusEl, 'error', 'Não foi possível acessar o microfone.');
      }
    });

    window.addEventListener('beforeunload', () => {
      if (stream) stream.getTracks().forEach((track) => track.stop());
    });
    setStatus(statusEl, 'idle');
  }

  document.querySelectorAll('[data-audio-transcriber]').forEach((btn) => {
    initMicButton(btn);
  });
})();
