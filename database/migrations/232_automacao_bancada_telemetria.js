// Incremental e retrocompativel: tabelas 229-231 permanecem intactas.
// Separa o que o CAD pediu (231), o que o ESP32 recebeu/aplicou/confirmou e o ultimo contato.
// PT100: apenas estrutura futura; nenhum valor de temperatura e aceito enquanto estiver desativado.
const db = require('../db');
module.exports = function up() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS automacao_bancada_telemetria (
      device_pk INTEGER NOT NULL REFERENCES automacao_dispositivos(id) ON DELETE CASCADE,
      digestor_id INTEGER NOT NULL CHECK(digestor_id BETWEEN 1 AND 4),
      last_poll_at TEXT,
      fase_entregue TEXT CHECK(fase_entregue IS NULL OR fase_entregue IN ('INICIO','MEIO','FINAL','PARADO')),
      reported_at TEXT,
      fase_recebida TEXT CHECK(fase_recebida IS NULL OR fase_recebida IN ('INICIO','MEIO','FINAL','PARADO')),
      fase_aplicada TEXT CHECK(fase_aplicada IS NULL OR fase_aplicada IN ('INICIO','MEIO','FINAL','PARADO')),
      saida_confirmada INTEGER CHECK(saida_confirmada IS NULL OR saida_confirmada IN (0,1)),
      origem TEXT NOT NULL DEFAULT 'SIMULACAO' CHECK(origem IN ('SIMULACAO','REAL')),
      firmware TEXT,
      uptime_s INTEGER,
      wifi_rssi INTEGER,
      sensor_tipo TEXT,
      sensor_status TEXT NOT NULL DEFAULT 'SEM_SENSOR' CHECK(sensor_status IN ('SEM_SENSOR','SEM_SINAL','VALIDO','FALHA')),
      temperatura_c REAL,
      timestamp_medicao TEXT,
      PRIMARY KEY (device_pk, digestor_id)
    );
  `);
};
