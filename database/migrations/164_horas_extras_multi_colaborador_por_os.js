module.exports = function up({ db, tableExists }) {
  if (!tableExists('escala_horas_extras')) return;

  const indexes = db.prepare("PRAGMA index_list('escala_horas_extras')").all();
  for (const index of indexes) {
    if (!index.unique) continue;
    const name = String(index.name || '');
    const columns = db.prepare(`PRAGMA index_info(${JSON.stringify(name)})`).all().map((column) => column.name);
    const normalized = columns.map((column) => String(column || '').toLowerCase());
    const isOnlyOsUnique = normalized.length === 1 && ['os_id', 'ordem_servico_id'].includes(normalized[0]);
    if (isOnlyOsUnique) db.exec(`DROP INDEX IF EXISTS ${JSON.stringify(name)}`);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_escala_horas_extras_os_colaborador_status
      ON escala_horas_extras(os_id, colaborador_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS uidx_escala_horas_extras_aberta_colaborador
      ON escala_horas_extras(colaborador_id)
      WHERE status = 'EM_ANDAMENTO';
  `);
};
