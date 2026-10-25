// Cadastro do endereço LAN para abrir a IHM local de cada ESP32 pelo CAD.
// O servidor NÃO se conecta ao endereço e NÃO usa o link como proxy.
// Idempotente: preserva todos os registros e tabelas existentes.
const db = require('../db');
module.exports = function up() {
  const columns = db.prepare('PRAGMA table_info(automacao_dispositivos)').all();
  if (!columns.some((column) => column.name === 'local_url')) {
    db.exec('ALTER TABLE automacao_dispositivos ADD COLUMN local_url TEXT');
  }
};
