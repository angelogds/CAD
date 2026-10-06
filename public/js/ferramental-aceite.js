(() => {
  function setupForm(form) {
    const canvas = form.querySelector('[data-signature-canvas]');
    const hidden = form.querySelector('[data-signature-data]');
    const clear = form.querySelector('[data-signature-clear]');
    const status = form.querySelector('[data-signature-status]');
    if (!canvas || !hidden) return;

    const ctx = canvas.getContext('2d');
    let drawing = false;
    let hasInk = false;

    function resize() {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      const snapshot = hasInk ? canvas.toDataURL('image/png') : null;
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#172b20';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, rect.width, rect.height);
      if (snapshot) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = snapshot;
      }
    }

    function point(event) {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    canvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      drawing = true;
      canvas.setPointerCapture?.(event.pointerId);
      const p = point(event);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!drawing) return;
      event.preventDefault();
      const p = point(event);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      hasInk = true;
      if (status) status.textContent = 'Assinatura registrada';
    });

    const stop = () => { drawing = false; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('pointerleave', stop);

    clear?.addEventListener('click', () => {
      hasInk = false;
      hidden.value = '';
      resize();
      if (status) status.textContent = 'Assine no quadro acima';
    });

    form.addEventListener('submit', (event) => {
      if (!hasInk) {
        event.preventDefault();
        if (status) status.textContent = 'A assinatura é obrigatória para confirmar.';
        canvas.focus();
        return;
      }
      hidden.value = canvas.toDataURL('image/png');
    });

    resize();
  }

  document.querySelectorAll('[data-tool-accept-form]').forEach(setupForm);
})();