// Pacotes de simulação para testes autorizados localmente; sem armamento remoto ou comandos de processo.
// Comandos expiram rapidamente e devem ser reemitidos pelo simulador ativo.
const db = require('../../database/db');
const { classifyTemperature, legacySignal } = require('./temperatura-sinaleiro');
const { normalizeSimulationState, readStoredState, CLOSED } = require('./estado-simulacao');
const VALID_FASES = Object.freeze(['INICIO','MEIO','FINAL','PARADO']);
const DURACAO_MS = 6500;
function bad(msg,status=400) { const e=new Error(msg);e.status=status;return e; }
function normalize(states) {
  if (!Array.isArray(states) || states.length<1 || states.length>4) throw bad('Selecione entre um e quatro digestores.');
  const seen = new Set();
  return states.map(item => {
    const id = Number(item && item.digestor_id);
    let fase = String(item && item.fase || '').trim().toUpperCase();
    if (!Number.isInteger(id)||id<1||id>4||seen.has(id)) throw bad('Digestor inválido ou repetido.');
    if (!VALID_FASES.includes(fase)) throw bad('Fase inválida: INICIO, MEIO, FINAL ou PARADO.');
    seen.add(id);
    const temperatura_c = item.temperatura_c == null ? null : item.temperatura_c;
    if (temperatura_c != null && !classifyTemperature(temperatura_c)) throw bad('Temperatura simulada inválida (0 a 850 °C).');
    const sinal = fase !== 'PARADO' && temperatura_c != null ? classifyTemperature(temperatura_c) : legacySignal(fase);
    if (fase !== 'PARADO' && temperatura_c != null) fase = sinal.fase;
    const virtual = normalizeSimulationState(item);
    return {digestor_id:id,fase,temperatura_c:fase === 'PARADO' ? null : temperatura_c,...sinal,
      ...(fase === 'PARADO' ? CLOSED : virtual || CLOSED),estado_simulacao_disponivel: fase !== 'PARADO' && temperatura_c != null && !!virtual};
  });
}
function publish(states, adminId) {
  const entries = normalize(states);
  const now = Date.now();
  const sel = db.prepare("SELECT fase,valid_until_ms,cor_sinaleiro,estado_simulacao_json FROM automacao_sinaleiros_bancada WHERE digestor_id=?");
  const ins = db.prepare("INSERT INTO automacao_sinaleiros_bancada (digestor_id,fase,valid_until_ms,updated_by,versao,published_at_ms,temperatura_c,faixa_temperatura,cor_sinaleiro,pronto_descarga,estado_simulacao_json) VALUES(?,?,?,?,1,?,?,?,?,?,?)");
  // Nova transição: avança versao e published_at_ms.
  const nova = db.prepare("UPDATE automacao_sinaleiros_bancada SET fase=?, valid_until_ms=?, updated_by=?, versao=versao+1, published_at_ms=?, temperatura_c=?, faixa_temperatura=?, cor_sinaleiro=?, pronto_descarga=?, estado_simulacao_json=? WHERE digestor_id=?");
  // Renovação da mesma fase ainda válida: estende só a validade; versao e published_at_ms permanecem.
  const renova = db.prepare("UPDATE automacao_sinaleiros_bancada SET valid_until_ms=?, updated_by=?, temperatura_c=?, faixa_temperatura=?, cor_sinaleiro=?, pronto_descarga=?, estado_simulacao_json=? WHERE digestor_id=?");
  const apply = db.transaction(() => {
    for (const entry of entries) {
      const validade = entry.fase==='PARADO' ? 0 : now+DURACAO_MS;
      const virtualJson = entry.estado_simulacao_disponivel ? JSON.stringify({aquecimento_simulado:entry.aquecimento_simulado,purgadores_simulados:entry.purgadores_simulados,purgadores_visuais:entry.purgadores_visuais,guilhotinas_simuladas:entry.guilhotinas_simuladas,empurradores_simulados:entry.empurradores_simulados,motor_digestor_simulado:entry.motor_digestor_simulado,etapa_mecanica:entry.etapa_mecanica,fonte_simulacao:'CAD'}) : null;
      const atual = sel.get(entry.digestor_id);
      if (!atual) { ins.run(entry.digestor_id,entry.fase,validade,adminId||null,now,entry.temperatura_c,entry.faixa_temperatura,entry.cor_sinaleiro,entry.pronto_descarga?1:0,virtualJson); continue; }
      const mesmaFase = atual.fase===entry.fase && (atual.cor_sinaleiro || legacySignal(atual.fase).cor_sinaleiro)===entry.cor_sinaleiro && (atual.estado_simulacao_json || null)===virtualJson;
      const ativa = entry.fase==='PARADO' || Number(atual.valid_until_ms)>now;
      if (mesmaFase && ativa) renova.run(validade,adminId||null,entry.temperatura_c,entry.faixa_temperatura,entry.cor_sinaleiro,entry.pronto_descarga?1:0,virtualJson,entry.digestor_id);
      else nova.run(entry.fase,validade,adminId||null,now,entry.temperatura_c,entry.faixa_temperatura,entry.cor_sinaleiro,entry.pronto_descarga?1:0,virtualJson,entry.digestor_id);
    }
  });
  apply();
  return {ok:true,modo:'SIMULACAO',comando_industrial_habilitado:false,estados:entries,duracao_ms:DURACAO_MS};
}
function poll(device, requested) {
  const id = device.digestor_id === null ? Number(requested) : device.digestor_id;
  if (!Number.isInteger(id) || id<1 || id>4) throw bad('digestor_id deve ser 1, 2, 3 ou 4.');
  if (requested != null && Number(requested)!==id) throw bad('Token sem autorização para este digestor.',403);
  const row=db.prepare("SELECT * FROM automacao_sinaleiros_bancada WHERE digestor_id=?").get(id);
  const remaining=row ? Math.max(0, Number(row.valid_until_ms)-Date.now()) : 0;
  const fase=remaining>0?row.fase:'PARADO';
  try{require('./bancada-telemetria.service').recordPoll(device,id,fase,row?Number(row.versao)||0:0);}catch(_){/* telemetria nunca bloqueia o sinal */}
  const sinal = fase === 'PARADO' ? legacySignal('PARADO') : { ...legacySignal(fase), ...(row.cor_sinaleiro ? {cor_sinaleiro:row.cor_sinaleiro,faixa_temperatura:row.faixa_temperatura,pronto_descarga:!!row.pronto_descarga} : {}) };
  const virtual = fase !== 'PARADO' ? readStoredState(row.estado_simulacao_json) : null;
  return {digestor_id:id,fase,...sinal,...(virtual || CLOSED),estado_simulacao_disponivel:!!(virtual && virtual.estado_simulacao_disponivel),fonte_simulacao:'CAD',temperatura_c:fase === 'PARADO' ? null : row.temperatura_c,origem:'SIMULACAO',versao_fase:row?Number(row.versao)||0:0,validade_ms:Math.min(remaining,DURACAO_MS),bancada:true,processo_habilitado:false};
}
module.exports={publish,poll,DURACAO_MS};
