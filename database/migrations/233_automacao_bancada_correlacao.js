// Aditiva: 229-232 permanecem intactas. Apenas ADD COLUMN (sem DROP/recriação), idempotente.
// Correlaciona comando e confirmação: cada publicação do CAD recebe uma versão (versao_fase);
// a telemetria guarda a versão entregue ao ESP32 e a versão que o firmware ecoou no relatório.
const db = require('../db');
function addColumn(table, col, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
}
module.exports = function up() {
  addColumn('automacao_sinaleiros_bancada', 'versao', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('automacao_sinaleiros_bancada', 'published_at_ms', 'INTEGER');
  addColumn('automacao_bancada_telemetria', 'versao_entregue', 'INTEGER');
  addColumn('automacao_bancada_telemetria', 'entregue_desde_ms', 'INTEGER');
  addColumn('automacao_bancada_telemetria', 'versao_reportada', 'INTEGER');
  addColumn('automacao_bancada_telemetria', 'reported_ms', 'INTEGER');
};
