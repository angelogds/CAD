(() => {
  'use strict';

  /*
   * Alertas de materiais do Modo TV.
   * Reutiliza o EventSource e o fetchSnapshot já mantidos por tv-mode.js.
   * Não abre SSE, polling HTTP ou endpoint adicional.
   */
  const STORAGE_KEY = 'cgTvProcessedMaterials';
  const ALERT_MS = 18000;
  const ATTACH_MS = 1000;
  const state = {
    source: null,
    queue: [],
    pending: new Set(),
    showing: false,
    current: null,
    timer: null,
    processed: new Map(),
    voiceToken: 0,
  };

  const $ = (id) => document.getElementById(id);
  const plain = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  const numberBR = (value) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

  function readProcessed() {
    try {
      const now = Date.now();
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      saved
        .filter((entry) => entry?.key && now - Number(entry.at || 0) < 7 * 86400000)
        .forEach((entry) => state.processed.set(entry.key, Number(entry.at || now)));
      persistProcessed();
    } catch (_error) {
      state.processed = new Map();
    }
  }

  function persistProcessed() {
    try {
      const values = [...state.processed].slice(-500).map(([key, at]) => ({ key, at }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch (_error) {}
  }

  function eventKey(raw) {
    return String(raw?.event_id || raw?.movimento_id || [
      raw?.os_id,
      raw?.item_id,
      raw?.quantidade_total_recebida,
      raw?.ts,
    ].filter((value) => value !== undefined && value !== null && value !== '').join(':'));
  }

  function splitNames(value) {
    const names = String(value || '')
      .split(/\s*,\s*|\s+e\s+/i)
      .map((name) => name.trim())
      .filter(Boolean)
      .filter((name) => plain(name) !== 'A DEFINIR');
    return [...new Map(names.map((name) => [plain(name), name])).values()];
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

  function osNumberForSpeech(value, fallbackId) {
    const digits = String(value || fallbackId || '').match(/\d+/)?.[0];
    return digits ? `OS número ${digits}` : 'ordem de serviço vinculada';
  }

  function unitForSpeech(value, quantity) {
    const unit = plain(value || 'UN');
    const plural = Number(quantity || 0) !== 1;
    if (['UN', 'UND', 'UNIDADE'].includes(unit)) return plural ? 'unidades' : 'unidade';
    if (unit === 'KG') return 'quilos';
    if (unit === 'G') return 'gramas';
    if (unit === 'L') return plural ? 'litros' : 'litro';
    if (unit === 'M') return plural ? 'metros' : 'metro';
    if (['PC', 'PÇ', 'PECA', 'PEÇA'].includes(unit)) return plural ? 'peças' : 'peça';
    return String(value || 'unidades').toLowerCase();
  }

  function buildVoiceMessage(material) {
    const names = splitNames(material?.responsavel);
    const salutation = names.length
      ? `${greeting()}, ${naturalNames(names)}.`
      : 'Atenção, equipe de manutenção.';
    const quantity = Number(material?.quantidade_recebida || 0);
    const qtyText = `${numberBR(quantity)} ${unitForSpeech(material?.unidade, quantity)}`;
    const partial = material?.recebimento_parcial
      ? 'O recebimento é parcial, mas esta quantidade já está disponível para retirada.'
      : 'O item recebido já está disponível para retirada.';

    return [
      salutation,
      `Material disponível no almoxarifado para a ${osNumberForSpeech(material?.numero, material?.os_id)}.`,
      `Item: ${material?.material || 'material não informado'}.`,
      `Quantidade recebida: ${qtyText}.`,
      `Equipamento: ${material?.equipamento || 'não informado'}.`,
      `Local de retirada: ${material?.local_estoque || 'almoxarifado'}.`,
      partial,
    ].join(' ').replace(/\s+/g, ' ').trim();
  }

  function setAssistantMessage(message) {
    const coreState = window.CGTVTest?.state;
    if (coreState && message) coreState.lastVoiceMessage = message;
    const strip = document.querySelector('.assistant-copy span');
    if (strip && message) strip.textContent = `“${message}”`;
  }

  function selectBrazilianVoice(utterance) {
    try {
      const voices = window.speechSynthesis?.getVoices?.() || [];
      const selected = voices.find((voice) => /^pt-BR$/i.test(voice.lang))
        || voices.find((voice) => /^pt/i.test(voice.lang));
      if (selected) utterance.voice = selected;
    } catch (_error) {}
  }

  function speakMaterial(material) {
    if (localStorage.getItem('cgTvVoice') === 'off') return false;
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return false;

    const message = buildVoiceMessage(material);
    const token = ++state.voiceToken;
    setAssistantMessage(message);
    try {
      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(message);
      utterance.lang = 'pt-BR';
      utterance.rate = 0.92;
      utterance.pitch = 1;
      utterance.volume = 1;
      selectBrazilianVoice(utterance);
      utterance.onend = () => {
        if (token === state.voiceToken && state.showing) finishMaterialAlert();
      };
      utterance.onerror = () => {
        if (token === state.voiceToken && state.showing) finishMaterialAlert();
      };
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (error) {
      console.warn('[TV][MATERIAL] Falha ao reproduzir aviso por voz', error);
      return false;
    }
  }

  function osAlertVisible() {
    const alert = $('tvNewOSAlert');
    return Boolean(window.CGTVTest?.state?.alertShowing || (alert && !alert.hidden));
  }

  function renderMaterialAlert(material) {
    const alert = $('tvMaterialAlert');
    if (!alert) return false;
    $('tvMaterialOS').textContent = material.numero || `OS #${material.os_id || ''}`;
    $('tvMaterialName').textContent = material.material || 'Material não informado';
    $('tvMaterialEquipment').textContent = material.equipamento || 'Equipamento não informado';
    $('tvMaterialDetails').innerHTML = `
      <div><dt>Responsável</dt><dd>${escapeHtml(material.responsavel || 'A definir')}</dd></div>
      <div><dt>Recebido</dt><dd>${escapeHtml(`${numberBR(material.quantidade_recebida)} ${material.unidade || 'UN'}`)}</dd></div>
      <div><dt>Disponível</dt><dd>${escapeHtml(`${numberBR(material.quantidade_disponivel)} ${material.unidade || 'UN'}`)}</dd></div>
      <div><dt>Retirada</dt><dd>${escapeHtml(material.local_estoque || 'Almoxarifado')}</dd></div>`;
    $('tvMaterialReadingStatus').textContent = material.recebimento_parcial
      ? 'Recebimento parcial: a quantidade já recebida está liberada para retirada.'
      : 'Material recebido e liberado para retirada no almoxarifado.';
    alert.hidden = false;
    return true;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    }[char]));
  }

  function markShown(material) {
    const key = material?._eventKey || eventKey(material);
    if (!key) return;
    state.pending.delete(key);
    state.processed.set(key, Date.now());
    persistProcessed();
  }

  function showNextMaterialAlert() {
    if (state.showing || !state.queue.length || osAlertVisible()) return;
    state.current = state.queue.shift();
    state.showing = true;
    if (!renderMaterialAlert(state.current)) {
      state.pending.delete(state.current?._eventKey || eventKey(state.current));
      state.showing = false;
      state.current = null;
      return;
    }

    // Só persiste a deduplicação depois que o alerta realmente entrou na tela.
    markShown(state.current);
    clearTimeout(state.timer);
    state.timer = setTimeout(finishMaterialAlert, ALERT_MS);
    const spoken = speakMaterial(state.current);
    if (!spoken) setAssistantMessage(buildVoiceMessage(state.current));
  }

  function finishMaterialAlert() {
    clearTimeout(state.timer);
    state.timer = null;
    state.voiceToken += 1;
    const alert = $('tvMaterialAlert');
    if (alert) alert.hidden = true;
    state.showing = false;
    state.current = null;
    setTimeout(showNextMaterialAlert, 250);
  }

  function interruptForOS() {
    if (!state.showing || !state.current) return;
    const interrupted = state.current;
    clearTimeout(state.timer);
    state.timer = null;
    state.voiceToken += 1;
    try { window.speechSynthesis?.cancel?.(); } catch (_error) {}
    const alert = $('tvMaterialAlert');
    if (alert) alert.hidden = true;
    state.showing = false;
    state.current = null;
    state.queue.unshift(interrupted);
  }

  function enqueue(material) {
    const key = eventKey(material);
    if (!key || state.processed.has(key) || state.pending.has(key)) return false;
    state.pending.add(key);
    state.queue.push({ ...material, _eventKey: key });
    showNextMaterialAlert();
    return true;
  }

  async function handlePayload(raw) {
    const key = eventKey(raw);
    if (!raw?.os_id || !key || state.processed.has(key) || state.pending.has(key)) return false;

    // Reserva a chave apenas em memória durante o enriquecimento para impedir
    // duas entregas simultâneas do mesmo evento sem marcá-lo como processado.
    state.pending.add(key);
    try {
      const core = window.CGTVTest;
      if (!core?.fetchSnapshot || !core?.findSnapshotOS) {
        state.pending.delete(key);
        return false;
      }
      const data = await core.fetchSnapshot({ detectNew: false });
      const os = core.findSnapshotOS(raw.os_id, data);
      if (!os) {
        state.pending.delete(key);
        return false;
      }

      state.queue.push({
        ...raw,
        _eventKey: key,
        numero: os.numero || `OS #${raw.os_id}`,
        equipamento: os.equipamento || 'Equipamento não informado',
        responsavel: os.responsavel || 'A definir',
        local_os: os.local || os.setor || null,
      });
      showNextMaterialAlert();
      return true;
    } catch (error) {
      state.pending.delete(key);
      throw error;
    }
  }

  function onMaterialEvent(event) {
    let payload = {};
    try { payload = JSON.parse(event.data || '{}'); } catch (_error) { return; }
    handlePayload(payload).catch((error) => console.warn('[TV][MATERIAL] Falha ao tratar evento', error));
  }

  function attachToCoreStream() {
    const source = window.CGTVTest?.state?.stream;
    if (!source || source === state.source) return;
    if (state.source) {
      try { state.source.removeEventListener('material_disponivel', onMaterialEvent); } catch (_error) {}
    }
    source.addEventListener('material_disponivel', onMaterialEvent);
    state.source = source;
  }

  function observeOSAlert() {
    const osAlert = $('tvNewOSAlert');
    if (!osAlert) return;
    const observer = new MutationObserver(() => {
      if (!osAlert.hidden) {
        interruptForOS();
        return;
      }
      setTimeout(showNextMaterialAlert, 350);
    });
    observer.observe(osAlert, { attributes: true, attributeFilter: ['hidden'] });
  }

  function init() {
    readProcessed();
    observeOSAlert();
    attachToCoreStream();
    setInterval(attachToCoreStream, ATTACH_MS);
  }

  window.CGTVMaterialAlerts = {
    handlePayload,
    buildVoiceMessage,
    eventKey,
    enqueue,
    attachToCoreStream,
    state,
  };

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();
