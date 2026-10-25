// Evolução aditiva: preserva as fases e os registros históricos, sem recriar tabelas.
const db = require('../db');
function add(table, name, ddl) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
  }
}
module.exports = function up() {
  for (const table of ['automacao_bancada_telemetria', 'automacao_sinaleiros_bancada']) {
    if (table === 'automacao_sinaleiros_bancada') add(table, 'temperatura_c', 'REAL');
    add(table, 'faixa_temperatura', 'TEXT');
    add(table, 'cor_sinaleiro', 'TEXT');
    add(table, 'pronto_descarga', 'INTEGER NOT NULL DEFAULT 0 CHECK(pronto_descarga IN (0,1))');
  }
};
