const { correctiveWhereSql } = require('../../utils/os-maintenance-type');

module.exports = ({ db, tableExists }) => {
  if (!tableExists('os')) return;
  // Uma view mantém o histórico original e reflete conclusões, reclassificações e novas OS sem cache.
  db.exec(`CREATE VIEW IF NOT EXISTS vw_criticidade_os_corretivas AS
    SELECT o.* FROM os o WHERE ${correctiveWhereSql(db)};`);
  const cols = db.prepare('PRAGMA table_info(os)').all().map(c => c.name);
  if (cols.includes('opened_at') && cols.includes('equipamento_id')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_criticidade_os_periodo_equipamento ON os(opened_at,equipamento_id)');
  }
  for (const table of ['preventiva_execucoes','pcm_lubrificacao_os_programadas','pcm_lubrificacao_execucoes']) {
    if (tableExists(table) && db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === 'os_id')) {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_criticidade_${table}_os ON ${table}(os_id)`);
    }
  }
};
