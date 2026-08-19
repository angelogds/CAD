const db = require('../../database/db');

function tableExists(name) {
  try { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); } catch (_e) { return false; }
}
function columns(name) {
  if (!tableExists(name)) return [];
  return db.prepare(`PRAGMA table_info(${name})`).all().map((row) => row.name);
}
function durationMinutes(start, end) {
  const parse = (value) => {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return NaN;
    const h = Number(match[1]); const m = Number(match[2]);
    if (h > 23 || m > 59) return NaN;
    return h * 60 + m;
  };
  const a = parse(start); const b = parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('Horário inválido.');
  return b >= a ? b - a : (24 * 60 - a) + b;
}
function minutesToHuman(value) {
  const total = Number(value || 0); const sign = total < 0 ? '-' : ''; const abs = Math.abs(total);
  return `${sign}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, '0')}`;
}
function issue(code, severity, title, total, details = []) { return { code, severity, title, total:Number(total || 0), details }; }

function runAudit() {
  const issues = [];

  if (tableExists('colaboradores') && columns('colaboradores').includes('user_id')) {
    const rows = db.prepare(`SELECT user_id, COUNT(*) AS total, GROUP_CONCAT(id) AS ids FROM colaboradores WHERE user_id IS NOT NULL AND IFNULL(ativo,1)=1 GROUP BY user_id HAVING COUNT(*) > 1`).all();
    if (rows.length) issues.push(issue('COLABORADOR_USER_DUPLICADO','ALTO','Mais de um colaborador ativo vinculado ao mesmo usuário',rows.length,rows));
  }

  if (tableExists('escala_banco_horas_movimentos')) {
    const creditos = db.prepare(`SELECT hora_extra_id, COUNT(*) AS total, GROUP_CONCAT(id) AS ids FROM escala_banco_horas_movimentos WHERE tipo='CREDITO_HORA_EXTRA' AND hora_extra_id IS NOT NULL GROUP BY hora_extra_id HAVING COUNT(*) > 1`).all();
    if (creditos.length) issues.push(issue('CREDITO_HORA_EXTRA_DUPLICADO','CRITICO','Hora extra com mais de um crédito no banco',creditos.length,creditos));

    const folgas = db.prepare(`SELECT folga_id, COUNT(*) AS total, GROUP_CONCAT(id) AS ids FROM escala_banco_horas_movimentos WHERE tipo='DEBITO_FOLGA' AND folga_id IS NOT NULL GROUP BY folga_id HAVING COUNT(*) > 1`).all();
    if (folgas.length) issues.push(issue('DEBITO_FOLGA_DUPLICADO','CRITICO','Folga com mais de um débito no banco',folgas.length,folgas));

    if (tableExists('colaboradores')) {
      const orfaos = db.prepare(`SELECT m.id,m.colaborador_id FROM escala_banco_horas_movimentos m LEFT JOIN colaboradores c ON c.id=m.colaborador_id WHERE c.id IS NULL`).all();
      if (orfaos.length) issues.push(issue('MOVIMENTO_COLABORADOR_ORFAO','ALTO','Movimentos sem colaborador válido',orfaos.length,orfaos));
    }
    const invalidos = db.prepare(`SELECT id,tipo,minutos FROM escala_banco_horas_movimentos WHERE minutos IS NULL OR minutos < 0`).all();
    if (invalidos.length) issues.push(issue('MOVIMENTO_MINUTOS_INVALIDO','ALTO','Movimentos com minutos ausentes ou negativos',invalidos.length,invalidos));
  }

  if (tableExists('escala_horas_extras')) {
    const invalidas = db.prepare(`SELECT id,colaborador_id,data_servico,total_minutos,status FROM escala_horas_extras WHERE total_minutos < 0 OR data_servico IS NULL OR trim(data_servico)=''`).all();
    if (invalidas.length) issues.push(issue('HORA_EXTRA_INVALIDA','ALTO','Horas extras com duração/data inválida',invalidas.length,invalidas));
  }

  if (tableExists('escala_folgas_programadas')) {
    const duplicadas = db.prepare(`SELECT colaborador_id,data_folga,COUNT(*) AS total,GROUP_CONCAT(id) AS ids FROM escala_folgas_programadas WHERE status <> 'CANCELADA' GROUP BY colaborador_id,data_folga HAVING COUNT(*) > 1`).all();
    if (duplicadas.length) issues.push(issue('FOLGA_DUPLICADA','ALTO','Mais de uma folga ativa do colaborador no mesmo dia',duplicadas.length,duplicadas));
  }

  return { ok: issues.length === 0, checkedAt:new Date().toISOString(), issues };
}

module.exports = { runAudit, durationMinutes, minutesToHuman };
