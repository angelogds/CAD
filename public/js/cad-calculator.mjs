import { calculateExpression, convertLength, formatCalculatorValue, selectionMeasurements } from './cad-calculator.logic.mjs';

let previousClose = null, answer = 0;
const history = [];

export function openCadCalculator(cad) {
  previousClose?.();
  if (!document.querySelector('link[data-cad-calculator-style]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/css/cad-calculator.css?v=20261029';
    link.dataset.cadCalculatorStyle = 'true'; document.head.append(link);
  }
  const priorFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'cad-calculator-overlay';
  overlay.innerHTML = `
    <section class="cad-calculator" role="dialog" aria-modal="true" aria-labelledby="cadCalculatorTitle">
      <header><div><span>UTILITÁRIOS DE DESENHO</span><h2 id="cadCalculatorTitle">Calculadora técnica</h2></div><button type="button" data-calc-close aria-label="Fechar calculadora">×</button></header>
      <form data-calc-form>
        <label for="cadCalcExpression">Expressão</label>
        <div class="cad-calc-expression"><input id="cadCalcExpression" autocomplete="off" spellcheck="false" placeholder="Ex.: (127 - 96) / 2"><button type="submit">Calcular</button></div>
        <p class="cad-calc-help">+ − × / · potência: ^ · sin, cos, tan em graus · sqrt, abs, round, min, max · pi e ans. Vírgula decimal aceita; separe argumentos com ;.</p>
        <div class="cad-calc-result" aria-live="polite"><span>Resultado</span><output id="cadCalcResult">—</output><span data-calc-unit></span></div>
        <p data-calc-error role="alert"></p>
      </form>
      <div class="cad-calc-measure"><label for="cadCalcMeasure">Medida do objeto selecionado</label><div><select id="cadCalcMeasure"></select><button type="button" data-calc-measure>Inserir medida</button></div><small data-calc-measure-help></small></div>
      <details><summary>Converter comprimento</summary><div class="cad-calc-convert"><label>De<select data-calc-from aria-label="Unidade de origem"></select></label><label>Para<select data-calc-to aria-label="Unidade de destino"></select></label><button type="button" data-calc-convert>Converter resultado</button></div><small>Ao usar no desenho, comprimentos convertidos retornam a milímetros.</small></details>
      <details><summary>Histórico desta sessão</summary><ol data-calc-history></ol></details>
      <footer><p data-calc-target></p><button type="button" data-calc-apply disabled>Usar na entrada do desenho</button></footer>
    </section>`;
  document.body.append(overlay);
  const q = (selector) => overlay.querySelector(selector);
  const input = q('#cadCalcExpression'), output = q('#cadCalcResult'), error = q('[data-calc-error]');
  const apply = q('[data-calc-apply]');
  let result = null, resultUnit = '', closed = false;
  const target = () => {
    const dynamic = document.querySelector('#cadDynamicInput .cad-dyn-input');
    if (dynamic && document.getElementById('cadDynamicInput')?.style.display !== 'none') return dynamic;
    const tool = cad?.toolManager?.active;
    if (tool?.name === 'line' && tool.start || tool?.name === 'polyline' && tool.points?.length) return document.getElementById('cadCommandInput');
    return null;
  };
  const updateTarget = () => {
    const available = Boolean(target()) && !(resultUnit && cad?.toolManager?.name === 'rotate');
    apply.disabled = result === null || !available;
    q('[data-calc-target]').textContent = available ? 'O valor será preenchido para você conferir e confirmar com Enter.' : 'Ative uma entrada numérica no desenho para usar o resultado.';
  };
  const setResult = (value, unit = '') => {
    result = value; resultUnit = unit; answer = value;
    output.textContent = formatCalculatorValue(value); q('[data-calc-unit]').textContent = unit;
    error.textContent = ''; updateTarget();
  };
  const showError = (reason) => { result = null; output.textContent = '—'; q('[data-calc-unit]').textContent = ''; error.textContent = reason.message || String(reason); updateTarget(); };
  const renderHistory = () => {
    const list = q('[data-calc-history]'); list.replaceChildren();
    for (const entry of history) {
      const item = document.createElement('li'), button = document.createElement('button');
      button.type = 'button'; button.textContent = `${entry.expression} = ${formatCalculatorValue(entry.value)}`;
      button.addEventListener('click', () => { input.value = entry.expression; setResult(entry.value); input.focus(); });
      item.append(button); list.append(item);
    }
    if (!history.length) { const item = document.createElement('li'); item.textContent = 'Os próximos cálculos aparecem aqui.'; list.append(item); }
  };
  const cleanup = (restore = true) => {
    if (closed) return; closed = true;
    document.removeEventListener('keydown', onKey, true); overlay.remove();
    if (previousClose === cleanup) previousClose = null;
    if (restore && priorFocus?.isConnected) priorFocus.focus();
  };
  const onKey = (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); cleanup(); }
    if (event.key === 'Enter' && event.target === input) { event.preventDefault(); q('[data-calc-form]').requestSubmit(); }
    if (event.key === 'Tab') {
      const nodes = [...overlay.querySelectorAll('button:not(:disabled),input,select:not(:disabled),summary')].filter((node) => node.getClientRects().length);
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
    }
  };
  previousClose = cleanup;
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('click', (event) => { if (event.target === overlay || event.target.closest('[data-calc-close]')) cleanup(); });
  q('[data-calc-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const expression = input.value;
      setResult(calculateExpression(expression, answer));
      history.unshift({ expression, value: result }); history.splice(10); renderHistory();
    } catch (reason) { showError(reason); }
  });
  input.addEventListener('input', () => { result = null; output.textContent = '—'; q('[data-calc-unit]').textContent = ''; error.textContent = ''; updateTarget(); });
  const selected = cad?.state?.entities?.filter((entity) => cad.selection.includes(entity.id)) || [];
  const measurements = selectionMeasurements(selected);
  const measure = q('#cadCalcMeasure');
  measurements.forEach((entry, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = `${entry.label}: ${formatCalculatorValue(entry.value)} mm`; measure.append(option); });
  measure.disabled = !measurements.length; q('[data-calc-measure]').disabled = !measurements.length;
  q('[data-calc-measure-help]').textContent = measurements.length ? 'Medidas atuais do desenho em milímetros.' : 'Selecione uma linha, círculo, retângulo, polilinha ou eixo antes de abrir a calculadora.';
  q('[data-calc-measure]').addEventListener('click', () => {
    const entry = measurements[Number(measure.value)];
    if (!entry) return;
    input.setRangeText(formatCalculatorValue(entry.value), input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, 'end');
    input.dispatchEvent(new Event('input')); input.focus();
  });
  const units = [['mm', 'Milímetros'], ['cm', 'Centímetros'], ['m', 'Metros'], ['in', 'Polegadas'], ['ft', 'Pés']];
  for (const selector of ['[data-calc-from]', '[data-calc-to]']) for (const [value, label] of units) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; q(selector).append(option);
  }
  q('[data-calc-convert]').addEventListener('click', () => {
    try {
      if (result === null) throw new Error('Calcule um resultado antes de converter.');
      const from = q('[data-calc-from]').value, to = q('[data-calc-to]').value;
      setResult(convertLength(result, from, to), to); q('[data-calc-from]').value = to;
    } catch (reason) { showError(reason); }
  });
  apply.addEventListener('click', () => {
    const destination = target(); if (!destination || result === null || apply.disabled) return;
    let value;
    try { value = resultUnit ? convertLength(result, resultUnit, 'mm') : result; }
    catch (reason) { showError(reason); return; }
    cleanup(false);
    if (destination.classList.contains('cad-dyn-input')) {
      destination.style.display = 'inline-flex';
      const button = document.querySelector('#cadDynamicInput .cad-dyn-value'); if (button) button.style.display = 'none';
    }
    destination.value = formatCalculatorValue(value);
    destination.dispatchEvent(new Event('input', { bubbles: true })); destination.focus(); destination.select();
  });
  renderHistory(); updateTarget(); input.focus();
  return { close: cleanup };
}
