(() => {
  document.querySelector('[data-withdraw-mode]')?.addEventListener('change',event=>event.target.form.submit());
  const batch = document.querySelector('[data-withdraw-batch]');
  if (batch) {
    const checks = [...batch.querySelectorAll('[data-material-check]')].filter(c => !c.disabled);
    const all = batch.querySelector('[data-select-all]');
    const submit = batch.querySelector('[data-batch-submit]');
    const update = () => {
      const count = checks.filter(c => c.checked).length;
      batch.classList.toggle('has-selection', count > 0);
      batch.querySelector('[data-selection-count]').textContent = `Materiais selecionados: ${count}`;
      submit.disabled = count === 0;
      const visible=checks.filter(c=>!c.closest('.ac-pick-item').hidden),selected=visible.filter(c=>c.checked).length;
      if (all) { all.checked = selected > 0 && selected === visible.length; all.indeterminate = selected > 0 && selected < visible.length; }
      checks.forEach(c => {
        const row = c.closest('.ac-pick-item');
        row.classList.toggle('is-selected', c.checked);
        const quantity = row.querySelector('input[type="number"]');
        quantity.disabled = !c.checked; quantity.required = c.checked;
      });
    };
    all?.addEventListener('change', () => { checks.filter(c=>!c.closest('.ac-pick-item').hidden).forEach(c => { c.checked = all.checked; }); update(); });
    checks.forEach(c => c.addEventListener('change', update));
    batch.addEventListener('submit', () => { if (batch.checkValidity()) { submit.disabled = true; submit.textContent = 'Registrando…'; } });
    batch.querySelector('[data-material-search]')?.addEventListener('input',event=>{const normalize=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();const q=normalize(event.target.value);checks.forEach(c=>{c.closest('.ac-pick-item').hidden=!normalize(c.closest('.ac-pick-item').textContent).includes(q);});update();});
    update();
  }
  const start = document.getElementById('startQrCamera');
  const video = document.getElementById('qrVideo');
  if (!start || !video) return;
  const status = document.getElementById('qrCameraStatus');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  let stream, timer, busy = false, detector, generation = 0;
  const stop = () => {
    generation++;
    clearInterval(timer); timer = null;
    stream?.getTracks().forEach(t => t.stop()); stream = null;
    video.srcObject = null; video.hidden = true;
    start.disabled = false; start.textContent = 'Escanear QR do funcionário';
    start.setAttribute('aria-expanded', 'false');
  };
  start.addEventListener('click', async () => {
    if (stream) { stop(); status.textContent = 'Câmera fechada.'; return; }
    if (!navigator.mediaDevices?.getUserMedia) { status.textContent = 'Câmera indisponível. Use o código do cartão ou a identificação manual abaixo.'; return; }
    start.disabled = true;
    try {
      detector = null;
      if ('BarcodeDetector' in window) { try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (_) {} }
      if (!detector && !window.jsQR) throw new Error('Leitor QR não carregado. Atualize a página.');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 960 } }, audio: false });
      video.srcObject = stream; video.hidden = false; await video.play();
      start.disabled = false; start.textContent = 'Fechar câmera'; start.setAttribute('aria-expanded', 'true');
      status.textContent = 'Aponte para o QR do cartão. A identificação abre automaticamente.';
      const scanGeneration = ++generation;
      timer = setInterval(async () => {
        if (busy || video.readyState < 2 || !stream) return;
        busy = true;
        try {
          let value;
          if (detector) value = (await detector.detect(video))[0]?.rawValue;
          else {
            canvas.width = Math.min(video.videoWidth, 800); canvas.height = Math.round(video.videoHeight * canvas.width / video.videoWidth);
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frame = context.getImageData(0, 0, canvas.width, canvas.height);
            value = window.jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })?.data;
          }
          if (value && stream && generation === scanGeneration) { stop(); const params = new URLSearchParams(start.dataset.context||''); params.set('codigo',value); window.location.assign('/almoxarifado/retiradas/qr?' + params + '#materiais-retirada'); }
        } catch (_) { if (detector && window.jsQR) detector = null; }
        finally { busy = false; }
      }, 280);
    } catch (error) { stop(); status.textContent = 'Não foi possível ler pela câmera. Confira a permissão ou use o código/manual abaixo.'; }
  });
  window.addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
})();
