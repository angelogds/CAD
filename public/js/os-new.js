(() => {
  const form = document.getElementById('os-form');
  if (!form) return;

  const fileInput = document.getElementById('abertura_fotos');
  const preview = document.getElementById('preview-abertura');
  const mediaTrigger = document.getElementById('btn-adicionar-midia');
  const submitBtn = document.getElementById('btn-salvar-os');
  const naoConformidadeEl = document.getElementById('nao_conformidade');
  const descricaoHiddenEl = document.getElementById('descricao_hidden');
  const equipamentoSelect = document.getElementById('equipamento_id');
  const equipamentoManual = document.getElementById('equipamento_manual');
  const sintomaEl = document.getElementById('sintoma_principal');
  const globalAssistant = document.getElementById('aiGlobalVoice');

  let isSubmitting = false;

  // A Nova OS passou a ser um fluxo exclusivamente escrito. O assistente global
  // continua disponível no restante do sistema, mas fica oculto nesta página.
  if (globalAssistant) {
    globalAssistant.classList.add('ai-voice-global--hidden-new-os');
    globalAssistant.setAttribute('aria-hidden', 'true');
  }

  function clearFieldError(field) {
    if (!field) return;
    field.classList.remove('is-invalid');
    field.setCustomValidity?.('');
  }

  function focusInvalidField(field, message) {
    if (!field) return;
    field.classList.add('is-invalid');
    if (message && field.setCustomValidity) field.setCustomValidity(message);
    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      try { field.focus({ preventScroll: true }); } catch (_e) { field.focus(); }
      field.reportValidity?.();
    }, 180);
  }

  function syncDescription() {
    if (!descricaoHiddenEl) return;
    descricaoHiddenEl.value = String(naoConformidadeEl?.value || '').trim();
  }

  function resetSubmitState() {
    isSubmitting = false;
    if (!submitBtn) return;
    submitBtn.disabled = false;
    submitBtn.removeAttribute('aria-busy');
    submitBtn.textContent = 'Salvar e gerar OS';
  }

  mediaTrigger?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', () => {
    if (!preview) return;
    preview.innerHTML = '';
    Array.from(fileInput.files || []).forEach((file) => {
      const el = document.createElement('span');
      el.className = 'pill-tag pill-gray';
      el.title = file.name;
      el.textContent = `📷 ${file.name}`;
      preview.appendChild(el);
    });
  });

  [equipamentoSelect, equipamentoManual].forEach((field) => {
    field?.addEventListener(field === equipamentoSelect ? 'change' : 'input', () => {
      clearFieldError(equipamentoSelect);
      clearFieldError(equipamentoManual);
    });
  });
  sintomaEl?.addEventListener('change', () => clearFieldError(sintomaEl));
  naoConformidadeEl?.addEventListener('input', () => {
    clearFieldError(naoConformidadeEl);
    syncDescription();
  });

  form.addEventListener('invalid', (event) => {
    event.target?.classList?.add('is-invalid');
    window.setTimeout(() => event.target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }), 0);
  }, true);

  form.addEventListener('submit', (event) => {
    if (isSubmitting) {
      event.preventDefault();
      return;
    }

    syncDescription();
    const equipamentoId = String(equipamentoSelect?.value || '').trim();
    const equipamentoManualTxt = String(equipamentoManual?.value || '').trim();
    const sintoma = String(sintomaEl?.value || '').trim();
    const naoConformidade = String(naoConformidadeEl?.value || '').trim();

    if (!equipamentoId && !equipamentoManualTxt) {
      event.preventDefault();
      focusInvalidField(equipamentoSelect || equipamentoManual, 'Selecione ou informe um equipamento.');
      return;
    }
    clearFieldError(equipamentoSelect);

    if (!sintoma) {
      event.preventDefault();
      focusInvalidField(sintomaEl, 'Selecione o sintoma principal.');
      return;
    }

    if (!naoConformidade || naoConformidade.length < 10) {
      event.preventDefault();
      focusInvalidField(naoConformidadeEl, 'Descreva a não conformidade com pelo menos 10 caracteres.');
      return;
    }

    if (!form.checkValidity()) {
      event.preventDefault();
      const invalid = form.querySelector(':invalid');
      focusInvalidField(invalid, invalid?.validationMessage || 'Revise este campo.');
      return;
    }

    isSubmitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
      submitBtn.textContent = 'Gerando OS...';
    }
  });

  window.addEventListener('pageshow', resetSubmitState);
})();
