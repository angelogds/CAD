(() => {
  'use strict';

  /*
   * Extensão da assistente de voz do Modo TV.
   * Não cria outra fila, não abre outro SSE e não consulta a API novamente.
   * Apenas enriquece a fala já disparada por tv-mode.js usando os dados do alerta visível.
   */
  const synth = window.speechSynthesis;
  const Utterance = window.SpeechSynthesisUtterance;
  const alert = document.getElementById('tvNewOSAlert');
  const readingStatus = document.getElementById('tvVoiceReadingStatus');

  if (!synth || !Utterance || !alert || synth.__cgFullOSVoice) return;

  const nativeSpeak = synth.speak.bind(synth);
  const nativeCancel = synth.cancel.bind(synth);
  let token = 0;
  let activeNumber = '';
  let heldByVoice = false;

  const text = (selector) => String(alert.querySelector(selector)?.textContent || '').replace(/\s+/g, ' ').trim();
  const plain = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

  function currentNumber() {
    return text('#tvAlertNumber');
  }

  function details() {
    const values = {};
    alert.querySelectorAll('#tvAlertDetails > div').forEach((item) => {
      const label = String(item.querySelector('dt')?.textContent || '').trim();
      const value = String(item.querySelector('dd')?.textContent || '').replace(/\s+/g, ' ').trim();
      if (label) values[plain(label)] = value;
    });
    return values;
  }

  function splitNames(value) {
    return String(value || '')
      .split(/\s*,\s*|\s+e\s+/i)
      .map((name) => name.trim())
      .filter(Boolean)
      .filter((name) => plain(name) !== 'A DEFINIR');
  }

  function naturalNames(names) {
    if (!names.length) return '';
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function numberForSpeech(value) {
    const digits = String(value || '').match(/\d+/)?.[0];
    return digits ? `OS número ${digits}` : String(value || 'ordem de serviço');
  }

  function priorityForSpeech(value) {
    const key = plain(value);
    if (['CRITICA', 'CRITICO', 'URGENTE', 'EMERGENCIAL'].includes(key)) return 'crítica';
    if (key === 'ALTA') return 'alta';
    if (['MEDIA', 'MEDIO'].includes(key)) return 'média';
    if (key === 'BAIXA') return 'baixa';
    return String(value || 'não informada').toLowerCase();
  }

  function statusFromVisibleTable(number) {
    const wanted = plain(number);
    const row = [...document.querySelectorAll('.os-table tbody tr')]
      .find((item) => plain(item.cells?.[0]?.textContent) === wanted);
    return String(row?.cells?.[5]?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function buildFullMessage() {
    if (alert.hidden) return '';

    const number = currentNumber();
    const equipment = text('#tvAlertEquipment') || 'equipamento não informado';
    const description = text('#tvAlertDescription') || 'descrição não informada';
    const info = details();
    const responsible = info.RESPONSAVEL || 'A definir';
    const location = info.LOCAL || 'local não informado';
    const priority = info.PRIORIDADE || 'não informada';
    const opening = info.ABERTURA || 'horário não informado';
    const status = statusFromVisibleTable(number) || 'aberta';
    const names = splitNames(responsible);

    const salutation = names.length
      ? `${greeting()}, ${naturalNames(names)}.`
      : 'Atenção, equipe de manutenção.';
    const assignment = names.length > 1
      ? 'Temos uma nova ordem de serviço aberta para vocês.'
      : names.length === 1
        ? 'Temos uma nova ordem de serviço aberta para você.'
        : 'Temos uma nova ordem de serviço para atendimento.';

    return [
      salutation,
      assignment,
      `${numberForSpeech(number)}.`,
      `Equipamento: ${equipment}.`,
      `Local: ${location}.`,
      `Prioridade: ${priorityForSpeech(priority)}.`,
      `Status: ${String(status).toLowerCase()}.`,
      `Abertura: ${opening}.`,
      `Descrição completa do serviço: ${description}.`,
    ].join(' ').replace(/\s+/g, ' ').trim();
  }

  function setReading(active, message = '') {
    alert.classList.toggle('is-speaking', active);
    if (readingStatus) {
      readingStatus.textContent = active
        ? 'Assistente lendo a ordem de serviço completa em voz alta…'
        : 'A assistente lerá responsável, OS, equipamento, local, prioridade, abertura e a descrição completa do chamado.';
    }
    if (message && window.CGTVTest?.state) {
      window.CGTVTest.state.lastVoiceMessage = message;
      const strip = document.querySelector('.assistant-copy span');
      if (strip) strip.textContent = `“${message}”`;
    }
  }

  function selectBrazilianVoice(utterance) {
    try {
      const voices = synth.getVoices?.() || [];
      const selected = voices.find((voice) => /^pt-BR$/i.test(voice.lang))
        || voices.find((voice) => /^pt/i.test(voice.lang));
      if (selected) utterance.voice = selected;
    } catch (_error) {}
  }

  function finishReading(localToken, spokenNumber) {
    if (localToken !== token) return;
    setReading(false);
    if (heldByVoice && currentNumber() === spokenNumber) alert.hidden = true;
    heldByVoice = false;
    activeNumber = '';
  }

  const observer = new MutationObserver(() => {
    if (!alert.hidden || !activeNumber || !synth.speaking) return;
    if (currentNumber() !== activeNumber) return;
    heldByVoice = true;
    alert.hidden = false;
    alert.classList.add('is-speaking');
  });
  observer.observe(alert, { attributes: true, attributeFilter: ['hidden'] });

  try {
    synth.speak = function enhancedSpeak(utterance) {
      const message = buildFullMessage();
      if (!message || !(utterance instanceof Utterance)) return nativeSpeak(utterance);

      const localToken = ++token;
      const spokenNumber = currentNumber();
      activeNumber = spokenNumber;
      heldByVoice = false;

      utterance.text = message;
      utterance.lang = 'pt-BR';
      utterance.rate = 0.92;
      utterance.pitch = 1;
      utterance.volume = 1;
      selectBrazilianVoice(utterance);

      const previousStart = utterance.onstart;
      const previousEnd = utterance.onend;
      const previousError = utterance.onerror;

      utterance.onstart = (event) => {
        setReading(true, message);
        if (typeof previousStart === 'function') previousStart.call(utterance, event);
      };
      utterance.onend = (event) => {
        finishReading(localToken, spokenNumber);
        if (typeof previousEnd === 'function') previousEnd.call(utterance, event);
      };
      utterance.onerror = (event) => {
        finishReading(localToken, spokenNumber);
        if (typeof previousError === 'function') previousError.call(utterance, event);
      };

      return nativeSpeak(utterance);
    };

    synth.cancel = function enhancedCancel() {
      token += 1;
      setReading(false);
      if (heldByVoice && currentNumber() === activeNumber) alert.hidden = true;
      heldByVoice = false;
      activeNumber = '';
      return nativeCancel();
    };

    synth.__cgFullOSVoice = true;
  } catch (error) {
    console.warn('[TV] Não foi possível ativar a leitura completa da OS', error);
  }

  window.CGTVVoiceAssistant = {
    buildFullMessage,
    details,
    numberForSpeech,
    priorityForSpeech,
  };
})();
