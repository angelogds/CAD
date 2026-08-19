(() => {
  const form = document.getElementById('os-form');
  if (!form) return;

  const fileInput = document.getElementById('abertura_fotos');
  const preview = document.getElementById('preview-abertura');
  const mediaTrigger = document.getElementById('btn-adicionar-midia');
  const submitBtn = document.getElementById('btn-salvar-os');
  const btn = document.getElementById('btn-converse-mecanico');
  const btnLabel = document.getElementById('btn-converse-label');
  const statusEl = document.getElementById('status-converse');
  const naoConformidadeEl = document.getElementById('nao_conformidade');
  const descricaoHiddenEl = document.getElementById('descricao_hidden');
  const criticidadeEl = document.getElementById('criticidade');
  const diagnosticoEl = document.getElementById('ai_diagnostico_inicial');
  const causaEl = document.getElementById('ai_causa');
  const acoesEl = document.getElementById('ai_acoes_iniciais');
  const diagnosticoHiddenEl = document.getElementById('diagnostico_inicial_hidden');
  const causaHiddenEl = document.getElementById('causa_mais_provavel_hidden');
  const acoesHiddenEl = document.getElementById('acoes_iniciais_hidden');
  const equipamentoSelect = document.getElementById('equipamento_id');
  const equipamentoManual = document.getElementById('equipamento_manual');
  const sintomaEl = document.getElementById('sintoma_principal');
  const globalAssistant = document.getElementById('aiGlobalVoice');

  let isRecording = false;
  let activeRecognition = null;
  let isSubmitting = false;

  if (globalAssistant) globalAssistant.classList.add('ai-voice-global--new-os');

  function setStatus(message, tone) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.remove('error', 'success', 'warning');
    if (tone) statusEl.classList.add(tone);
  }

  function setButtonState(state) {
    if (!btn || !btnLabel) return;
    btn.disabled = state === 'processing';
    if (state === 'recording') {
      btn.classList.add('is-recording');
      btnLabel.textContent = 'Parar escuta';
      return;
    }
    if (state === 'processing') {
      btn.classList.remove('is-recording');
      btnLabel.textContent = 'Analisando...';
      return;
    }
    btn.classList.remove('is-recording');
    btnLabel.textContent = 'Converse com o Mecânico';
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

  function syncHiddenFields() {
    const naoConformidade = String(naoConformidadeEl?.value || '').trim();
    if (descricaoHiddenEl) descricaoHiddenEl.value = naoConformidade;
    if (diagnosticoHiddenEl) diagnosticoHiddenEl.value = String(diagnosticoEl?.value || '').trim();
    if (causaHiddenEl) causaHiddenEl.value = String(causaEl?.value || '').trim();
    if (acoesHiddenEl) acoesHiddenEl.value = String(acoesEl?.value || '').trim();
  }

  function resetSubmitState() {
    isSubmitting = false;
    if (!submitBtn) return;
    submitBtn.disabled = false;
    submitBtn.removeAttribute('aria-busy');
    submitBtn.textContent = 'Salvar e gerar OS';
  }

  async function parseJsonSafe(response) {
    const raw = await response.text();
    try { return JSON.parse(raw); } catch (_e) { throw new Error('Resposta inválida do servidor.'); }
  }

  async function enviarParaAnaliseVoz(transcricao) {
    const response = await fetch('/os/voice/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: transcricao }),
    });
    const payload = await parseJsonSafe(response);
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Falha na análise por voz.');
    return payload.preview || {};
  }

  function preencherCampos(transcricao, analise) {
    if (naoConformidadeEl) naoConformidadeEl.value = transcricao;
    if (descricaoHiddenEl) descricaoHiddenEl.value = transcricao;
    if (analise.sintoma_principal && sintomaEl) sintomaEl.value = analise.sintoma_principal;
    if (analise.criticidade && criticidadeEl) criticidadeEl.value = String(analise.criticidade).toUpperCase();
    if (analise.equipamento && !equipamentoSelect?.value && analise.equipamento.manual && equipamentoManual) {
      equipamentoManual.value = analise.equipamento.manual;
    }

    if (diagnosticoEl) diagnosticoEl.value = String(analise.causa_provavel || '').trim();
    if (causaEl) causaEl.value = String(analise.acao_corretiva || '').trim();
    if (acoesEl) acoesEl.value = String(analise.acao_preventiva || '').trim();
    syncHiddenFields();
    clearFieldError(naoConformidadeEl);
    clearFieldError(sintomaEl);
  }

  mediaTrigger?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', () => {
    if (!preview) return;
    preview.innerHTML = '';
    Array.from(fileInput.files || []).forEach((file) => {
      const el = document.createElement('span');
      el.className = 'pill-tag pill-gray';
      el.title = file.name;
      el.textContent = `${String(file.type || '').startsWith('video/') ? '🎬' : '🖼️'} ${file.name}`;
      preview.appendChild(el);
    });
  });

  btn?.addEventListener('click', () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setStatus('Reconhecimento de voz não suportado neste navegador. Digite a descrição manualmente.', 'warning');
      return;
    }

    if (isRecording && activeRecognition) {
      activeRecognition.stop();
      return;
    }

    const recognition = new SR();
    activeRecognition = recognition;
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    setButtonState('recording');
    setStatus('Ouvindo... fale o problema do equipamento.', null);
    isRecording = true;

    recognition.onresult = async (event) => {
      try {
        const transcricao = String(event?.results?.[0]?.[0]?.transcript || '').trim();
        if (!transcricao) throw new Error('Não foi possível entender a fala.');
        isRecording = false;
        activeRecognition = null;
        setButtonState('processing');
        setStatus('Transcrição concluída. Analisando com IA...', null);
        const analise = await enviarParaAnaliseVoz(transcricao);
        preencherCampos(transcricao, analise);
        setStatus('Análise concluída. Revise a não conformidade e salve a OS.', 'success');
      } catch (error) {
        setStatus(error.message || 'Falha no processamento por voz.', 'warning');
      } finally {
        activeRecognition = null;
        isRecording = false;
        setButtonState('idle');
      }
    };

    recognition.onerror = () => {
      setStatus('Permissão de microfone negada ou indisponível. Continue manualmente.', 'warning');
      activeRecognition = null;
      isRecording = false;
      setButtonState('idle');
    };

    recognition.onend = () => {
      if (!isRecording) return;
      activeRecognition = null;
      isRecording = false;
      setButtonState('idle');
      setStatus('Escuta encerrada. Você pode tentar novamente ou preencher manualmente.', null);
    };

    recognition.start();
  });

  [equipamentoSelect, equipamentoManual].forEach((field) => {
    field?.addEventListener(field === equipamentoSelect ? 'change' : 'input', () => {
      clearFieldError(equipamentoSelect);
      clearFieldError(equipamentoManual);
    });
  });
  sintomaEl?.addEventListener('change', () => clearFieldError(sintomaEl));
  naoConformidadeEl?.addEventListener('input', () => clearFieldError(naoConformidadeEl));

  form.addEventListener('invalid', (event) => {
    event.target?.classList?.add('is-invalid');
    window.setTimeout(() => event.target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }), 0);
  }, true);

  form.addEventListener('submit', (event) => {
    if (isSubmitting) {
      event.preventDefault();
      return;
    }

    syncHiddenFields();
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
