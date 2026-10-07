(() => {
  const root = document.querySelector('[data-scan-root]');
  if (!root) return;

  const endpoint = root.dataset.scanEndpoint;
  const video = root.querySelector('[data-scan-video]');
  const placeholder = root.querySelector('[data-scan-placeholder]');
  const startBtn = root.querySelector('[data-scan-start]');
  const stopBtn = root.querySelector('[data-scan-stop]');
  const form = root.querySelector('[data-scan-form]');
  const input = root.querySelector('[data-scan-input]');
  const result = root.querySelector('[data-scan-result]');

  let stream = null;
  let detector = null;
  let scanning = false;
  let locked = false;
  let lastValue = '';
  let lastReadAt = 0;

  function setResult(ok, title, detail) {
    result.classList.toggle('is-ok', Boolean(ok));
    result.classList.toggle('is-error', !ok);
    result.innerHTML = '<strong>' + String(title || '') + '</strong><span>' + String(detail || '') + '</span>';
  }

  function updateSummary(summary) {
    if (!summary) return;
    const map = {
      esperado: summary.total_esperado,
      localizado: summary.total_localizado,
      'nao-localizado': summary.total_nao_localizado,
      'fora-escopo': summary.total_fora_escopo,
    };
    Object.entries(map).forEach(([key, value]) => {
      const el = document.querySelector('[data-scan-kpi="' + key + '"]');
      if (el && value !== undefined && value !== null) el.textContent = value;
    });
    const expected = Number(summary.total_esperado || 0);
    const found = Number(summary.total_localizado || 0);
    const pct = expected ? Math.min(100, Math.round(found * 100 / expected)) : 0;
    const bar = document.querySelector('[data-scan-progress]');
    if (bar) bar.style.width = pct + '%';
  }

  function updateRow(tool) {
    if (!tool?.id) return;
    const row = document.querySelector('[data-scan-tool-id="' + tool.id + '"]');
    if (!row) return;
    row.className = 'is-localizado';
    const status = row.querySelector('[data-scan-status]');
    if (status) {
      status.textContent = 'LOCALIZADO';
      status.className = 'tool-badge tool-badge--accepted';
    }
  }

  async function submitValue(value) {
    const raw = String(value || '').trim();
    if (!raw || locked) return;
    locked = true;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ codigo: raw, ajax: '1' }),
        credentials: 'same-origin',
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Falha na leitura.');
      setResult(true, payload.ferramenta.codigo_interno + ' localizado', payload.ferramenta.descricao || '');
      updateSummary(payload.resumo);
      updateRow(payload.ferramenta);
      if (input) input.value = '';
      lastValue = raw;
      lastReadAt = Date.now();
    } catch (error) {
      setResult(false, 'Leitura não registrada', error.message || 'Verifique o QR e tente novamente.');
    } finally {
      setTimeout(() => { locked = false; }, 900);
    }
  }

  async function stopCamera() {
    scanning = false;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    if (video) video.srcObject = null;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    placeholder.hidden = false;
  }

  async function loop() {
    if (!scanning || !detector || !video) return;
    try {
      const codes = await detector.detect(video);
      if (codes.length) {
        const value = codes[0].rawValue || '';
        if (value && (value !== lastValue || Date.now() - lastReadAt > 2500)) {
          await submitValue(value);
        }
      }
    } catch (_) {}
    if (scanning) window.requestAnimationFrame(loop);
  }

  async function startCamera() {
    if (!('BarcodeDetector' in window)) {
      setResult(false, 'Leitura por câmera indisponível', 'Use o campo manual ou abra o QR diretamente com a câmera do celular.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setResult(false, 'Câmera indisponível', 'Este navegador não liberou acesso à câmera.');
      return;
    }
    try {
      const formats = await BarcodeDetector.getSupportedFormats();
      if (!formats.includes('qr_code')) throw new Error('QR Code não suportado neste navegador.');
      detector = new BarcodeDetector({ formats: ['qr_code'] });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      video.srcObject = stream;
      await video.play();
      placeholder.hidden = true;
      startBtn.disabled = true;
      stopBtn.disabled = false;
      scanning = true;
      setResult(true, 'Câmera ativa', 'Aponte para a etiqueta QR da ferramenta.');
      window.requestAnimationFrame(loop);
    } catch (error) {
      setResult(false, 'Não foi possível iniciar a câmera', error.message || 'Verifique a permissão do navegador.');
      stopCamera();
    }
  }

  startBtn?.addEventListener('click', startCamera);
  stopBtn?.addEventListener('click', stopCamera);
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    submitValue(input?.value);
  });
  window.addEventListener('beforeunload', stopCamera);
})();