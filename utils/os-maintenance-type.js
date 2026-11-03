// A origem preventiva prevalece sobre o antigo DEFAULT 'CORRETIVA'.
// Não inferimos falhas a partir da prioridade, descrição ou ausência de tipo.
const CORRECTIVE_TYPES = ['CORRETIVA', 'EMERGENCIAL', 'FALHA', 'QUEBRA', 'CRITICA', 'CRÍTICA'];
const PLANNED_TYPES = ['PREVENTIVA', 'PREDITIVA', 'INSPECAO', 'INSPEÇÃO', 'LUBRIFICACAO', 'LUBRIFICAÇÃO'];
function columns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
}
function normalizeSqlText(value) {
  let sql=value;
  for (const [from,to] of [['í','i'],['Í','I'],['ç','c'],['Ç','C'],['ã','a'],['Ã','A']]) sql=`REPLACE(${sql},'${from}','${to}')`;
  return `UPPER(TRIM(${sql}))`;
}
function quoted(values) { return values.map(v => `'${v}'`).join(','); }
function maintenanceTypeSql(db, alias = 'o') {
  const c = columns(db, 'os');
  const typed = ['tipo', 'tipo_manutencao'].filter(k => c.has(k)).map(k => `NULLIF(${normalizeSqlText(`${alias}.${k}`)},'')`);
  const scheduled = typed.map(expr => `${expr} IN (${quoted(PLANNED_TYPES)})`);
  if (c.has('origem')) scheduled.push(`(${normalizeSqlText(`${alias}.origem`)}) IN (${quoted(PLANNED_TYPES)})`);
  if (c.has('preventiva_execucao_id')) scheduled.push(`COALESCE(${alias}.preventiva_execucao_id,0)>0`);
  for (const table of ['preventiva_execucoes', 'pcm_lubrificacao_os_programadas', 'pcm_lubrificacao_execucoes']) {
    if (columns(db, table).has('os_id')) scheduled.push(`EXISTS (SELECT 1 FROM ${table} planejada WHERE planejada.os_id=${alias}.id)`);
  }
  const tipo = typed.length ? `COALESCE(${[...typed, "''"].join(',')})` : "''";
  return scheduled.length ? `CASE WHEN ${scheduled.join(' OR ')} THEN 'PREVENTIVA' ELSE ${tipo} END` : tipo;
}
function correctiveWhereSql(db, alias = 'o') {
  const c = columns(db, 'os');
  const status = c.has('status') ? ` AND UPPER(TRIM(COALESCE(${alias}.status,''))) NOT IN ('CANCELADA','CANCELADO')` : '';
  return `(${maintenanceTypeSql(db, alias)}) IN (${quoted(CORRECTIVE_TYPES)})${status}`;
}
module.exports = { maintenanceTypeSql, correctiveWhereSql, CORRECTIVE_TYPES };
