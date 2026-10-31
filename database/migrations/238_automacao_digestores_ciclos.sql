-- Histórico de ciclos por digestor. NUNCA transforma simulação em produção real.
-- Atribuição de colaborador só com confirmação explícita no registro real.
CREATE TABLE IF NOT EXISTS automacao_digestor_ciclos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  digestor_id INTEGER NOT NULL CHECK(digestor_id BETWEEN 1 AND 4),
  origem TEXT NOT NULL CHECK(origem IN ('REAL_MANUAL','SIMULACAO')),
  colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  registrado_por_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  atualizado_por_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK(status IN ('CARREGANDO','COZINHANDO','DESCARREGANDO','CONCLUIDO','CANCELADO')),
  inicio_ms INTEGER NOT NULL,
  carga_fim_ms INTEGER,
  cozimento_fim_ms INTEGER,
  descarga_fim_ms INTEGER,
  atualizado_ms INTEGER NOT NULL,
  observacao TEXT,
  chave_simulacao TEXT UNIQUE,
  duracao_virtual_carga_s REAL,
  duracao_virtual_cozimento_s REAL,
  duracao_virtual_descarga_s REAL,
  duracao_virtual_transferencia_s REAL,
  CHECK(origem <> 'REAL_MANUAL' OR colaborador_id IS NOT NULL),
  CHECK(origem <> 'SIMULACAO' OR colaborador_id IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_automacao_ciclo_real_aberto
  ON automacao_digestor_ciclos(digestor_id)
  WHERE origem = 'REAL_MANUAL' AND status IN ('CARREGANDO','COZINHANDO','DESCARREGANDO');
CREATE INDEX IF NOT EXISTS idx_automacao_ciclo_inicio ON automacao_digestor_ciclos(origem,inicio_ms);
CREATE INDEX IF NOT EXISTS idx_automacao_ciclo_operador ON automacao_digestor_ciclos(colaborador_id,status,inicio_ms);
