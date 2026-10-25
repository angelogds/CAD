// Aditiva: estados exclusivamente virtuais; não cria comandos ou permissões industriais.
const db = require('../db');
module.exports = function up() {
  for (const table of ['automacao_sinaleiros_bancada','automacao_bancada_telemetria']) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name==='estado_simulacao_json')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN estado_simulacao_json TEXT`);
    }
  }
};
