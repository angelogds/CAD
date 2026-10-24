// Expiração explícita: a falta de renovação apaga o comando de teste.
const db=require('../db');
module.exports=function up(){
  db.exec("CREATE TABLE IF NOT EXISTS automacao_sinaleiros_bancada (digestor_id INTEGER PRIMARY KEY CHECK(digestor_id BETWEEN 1 AND 4), fase TEXT NOT NULL CHECK(fase IN ('INICIO','MEIO','FINAL','PARADO')), valid_until_ms INTEGER NOT NULL DEFAULT 0, updated_by INTEGER)");
};
