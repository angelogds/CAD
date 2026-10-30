// Apenas sinais virtuais da bancada. Não aceita armamento, GPIOs ou comandos industriais.
const CLOSED = Object.freeze({ aquecimento_simulado: false, purgadores_simulados: Object.freeze({ camisa: 'FECHADO', eixo: 'FECHADO' }) });
function normalizeSimulationState(value) {
  const b = value || {};
  if (b.estado_simulacao_disponivel !== undefined && typeof b.estado_simulacao_disponivel !== 'boolean') {
    const e = new Error('estado_simulacao_disponivel deve ser booleano.');e.status = 400;throw e;
  }
  // Defaults fechados com flag false são failsafe, não evidência de um pacote completo.
  if (b.estado_simulacao_disponivel === false) return null;
  if (b.aquecimento_simulado === undefined && b.purgadores_simulados === undefined && b.estado_simulacao_disponivel !== true) return null;
  const p = b.purgadores_simulados;
  if (typeof b.aquecimento_simulado !== 'boolean' || !p || typeof p !== 'object' || Array.isArray(p) || !['ABERTO','FECHADO'].includes(p.camisa) || !['ABERTO','FECHADO'].includes(p.eixo)) {
    const e = new Error('Estado simulado exige aquecimento_simulado booleano e purgadores camisa/eixo ABERTO ou FECHADO.');e.status = 400;throw e;
  }
  const valves = ['ABERTO','FECHADO'];
  const visual = b.purgadores_visuais;
  const gates = b.guilhotinas_simuladas;
  const stages = ['PARADO','CARGA','COZIMENTO','DESCARGA','TRANSFERENCIA','CONCLUIDO'];
  if (visual !== undefined && (!visual || typeof visual !== 'object' || Array.isArray(visual) ||
      !valves.includes(visual.camisa) || !valves.includes(visual.eixo))) {
    const e = new Error('Purgadores visuais inválidos.'); e.status = 400; throw e;
  }
  if (gates !== undefined && (!gates || typeof gates !== 'object' || Array.isArray(gates) ||
      !['ABERTA','FECHADA'].includes(gates.carga) || !['ABERTA','FECHADA'].includes(gates.descarga))) {
    const e = new Error('Guilhotinas simuladas inválidas.'); e.status = 400; throw e;
  }
  if (b.etapa_mecanica !== undefined && !stages.includes(b.etapa_mecanica)) {
    const e = new Error('Etapa mecânica inválida.'); e.status = 400; throw e;
  }
  return { aquecimento_simulado: b.aquecimento_simulado, purgadores_simulados: { camisa: p.camisa, eixo: p.eixo },
    purgadores_visuais: visual ? { camisa: visual.camisa, eixo: visual.eixo } : { camisa: p.camisa, eixo: p.eixo },
    guilhotinas_simuladas: gates ? { carga: gates.carga, descarga: gates.descarga } : { carga: 'FECHADA', descarga: 'FECHADA' },
    etapa_mecanica: b.etapa_mecanica || 'PARADO' };
}
function readStoredState(raw) {
  try { const state = JSON.parse(raw || 'null'); if (!state) return null; const virtual = normalizeSimulationState(state); return { ...(virtual || CLOSED), estado_simulacao_disponivel: !!virtual, fonte_simulacao: state.fonte_simulacao === 'CAD' ? 'CAD' : 'LOCAL' }; } catch (_) { return null; }
}
module.exports = { normalizeSimulationState, readStoredState, CLOSED };
