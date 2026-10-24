// Somente sinalização de bancada: NÃO oferece comandos de processo/CLP/vapor.
// Comandos expiram rapidamente e devem ser reemitidos pelo simulador ativo.
const db = require('../../database/db');
const VALID_FASES = Object.freeze(['INICIO','MEIO','FINAL','PARADO']);
const DURACAO_MS = 6500;
function bad(msg,status=400) { const e=new Error(msg);e.status=status;return e; }
function normalize(states) {
  if (!Array.isArray(states) || states.length<1 || states.length>4) throw bad('Selecione entre um e quatro digestores.');
  const seen = new Set();
  return states.map(item => {
    const id = Number(item && item.digestor_id);
    const fase = String(item && item.fase || '').trim().toUpperCase();
    if (!Number.isInteger(id)||id<1||id>4||seen.has(id)) throw bad('Digestor inválido ou repetido.');
    if (!VALID_FASES.includes(fase)) throw bad('Fase inválida: INICIO, MEIO, FINAL ou PARADO.');
    seen.add(id);
    return {digestor_id:id,fase};
  });
}
function publish(states, adminId) {
  const entries = normalize(states);
  const now = Date.now();
  const sel = db.prepare("SELECT fase,valid_until_ms FROM automacao_sinaleiros_bancada WHERE digestor_id=?");
  const ins = db.prepare("INSERT INTO automacao_sinaleiros_bancada (digestor_id,fase,valid_until_ms,updated_by,versao,published_at_ms) VALUES(?,?,?,?,1,?)");
  // Nova transição: avança versao e published_at_ms.
  const nova = db.prepare("UPDATE automacao_sinaleiros_bancada SET fase=?, valid_until_ms=?, updated_by=?, versao=versao+1, published_at_ms=? WHERE digestor_id=?");
  // Renovação da mesma fase ainda válida: estende só a validade; versao e published_at_ms permanecem.
  const renova = db.prepare("UPDATE automacao_sinaleiros_bancada SET valid_until_ms=?, updated_by=? WHERE digestor_id=?");
  const apply = db.transaction(() => {
    for (const entry of entries) {
      const validade = entry.fase==='PARADO' ? 0 : now+DURACAO_MS;
      const atual = sel.get(entry.digestor_id);
      if (!atual) { ins.run(entry.digestor_id,entry.fase,validade,adminId||null,now); continue; }
      const mesmaFase = atual.fase===entry.fase;
      const ativa = entry.fase==='PARADO' || Number(atual.valid_until_ms)>now;
      if (mesmaFase && ativa) renova.run(validade,adminId||null,entry.digestor_id);
      else nova.run(entry.fase,validade,adminId||null,now,entry.digestor_id);
    }
  });
  apply();
  return {ok:true,modo:'SIMULACAO',comando_industrial_habilitado:false,estados:entries,duracao_ms:DURACAO_MS};
}
function poll(device, requested) {
  const id = device.digestor_id === null ? Number(requested) : device.digestor_id;
  if (!Number.isInteger(id) || id<1 || id>4) throw bad('digestor_id deve ser 1, 2, 3 ou 4.');
  if (requested != null && Number(requested)!==id) throw bad('Token sem autorização para este digestor.',403);
  const row=db.prepare("SELECT fase,valid_until_ms,versao FROM automacao_sinaleiros_bancada WHERE digestor_id=?").get(id);
  const remaining=row ? Math.max(0, Number(row.valid_until_ms)-Date.now()) : 0;
  const fase=remaining>0?row.fase:'PARADO';
  try{require('./bancada-telemetria.service').recordPoll(device,id,fase,row?Number(row.versao)||0:0);}catch(_){/* telemetria nunca bloqueia o sinal */}
  return {digestor_id:id,fase,versao_fase:row?Number(row.versao)||0:0,validade_ms:Math.min(remaining,DURACAO_MS),bancada:true,processo_habilitado:false};
}
module.exports={publish,poll,DURACAO_MS};
