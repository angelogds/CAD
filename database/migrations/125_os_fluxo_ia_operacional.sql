PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sintomas_padrao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS acoes_execucao_padrao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS os_ia_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  os_id INTEGER,
  nao_conformidade_id INTEGER,
  tipo TEXT NOT NULL,
  entrada_json TEXT,
  resposta_json TEXT,
  status TEXT,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES users(id),
  FOREIGN KEY (os_id) REFERENCES os(id)
);

ALTER TABLE os ADD COLUMN setor_id INTEGER;
ALTER TABLE os ADD COLUMN sintoma_principal TEXT;
ALTER TABLE os ADD COLUMN severidade TEXT;
ALTER TABLE os ADD COLUMN nc_observacao_curta TEXT;
ALTER TABLE os ADD COLUMN equipamento_parado INTEGER DEFAULT 0;
ALTER TABLE os ADD COLUMN vazamento INTEGER DEFAULT 0;
ALTER TABLE os ADD COLUMN aquecimento INTEGER DEFAULT 0;
ALTER TABLE os ADD COLUMN ruido_anormal INTEGER DEFAULT 0;
ALTER TABLE os ADD COLUMN vibracao INTEGER DEFAULT 0;
ALTER TABLE os ADD COLUMN odor_anormal INTEGER DEFAULT 0;
ALTER TABLE os ADD COLUMN baixa_performance INTEGER DEFAULT 0;
ALTER TABLE os ADD COLUMN travamento INTEGER DEFAULT 0;
ALTER TABLE os ADD COLUMN ai_diagnostico_inicial TEXT;
ALTER TABLE os ADD COLUMN ai_causa_provavel TEXT;
ALTER TABLE os ADD COLUMN ai_risco_operacional TEXT;
ALTER TABLE os ADD COLUMN ai_servico_sugerido TEXT;
ALTER TABLE os ADD COLUMN ai_prioridade_sugerida TEXT;
ALTER TABLE os ADD COLUMN ai_observacao_seguranca TEXT;
ALTER TABLE os ADD COLUMN ai_descricao_tecnica_os TEXT;

ALTER TABLE os ADD COLUMN acoes_executadas_json TEXT;
ALTER TABLE os ADD COLUMN pecas_utilizadas_json TEXT;
ALTER TABLE os ADD COLUMN teste_operacional_realizado INTEGER DEFAULT 0;
ALTER TABLE os ADD COLUMN falha_eliminada INTEGER DEFAULT 0;
ALTER TABLE os ADD COLUMN requer_monitoramento INTEGER DEFAULT 0;
ALTER TABLE os ADD COLUMN tipo_acao_fechamento TEXT;
ALTER TABLE os ADD COLUMN observacao_curta_fechamento TEXT;
ALTER TABLE os ADD COLUMN ai_descricao_servico_executado TEXT;
ALTER TABLE os ADD COLUMN ai_acao_corretiva_realizada TEXT;
ALTER TABLE os ADD COLUMN ai_recomendacao_reincidencia TEXT;
ALTER TABLE os ADD COLUMN ai_observacao_final_tecnica TEXT;

INSERT OR IGNORE INTO sintomas_padrao (nome, ativo) VALUES
('vazamento', 1),
('aquecimento', 1),
('vibracao', 1),
('ruido_anormal', 1),
('travamento', 1),
('queda_de_desempenho', 1),
('folga_mecanica', 1),
('desalinhamento', 1),
('material_acumulado', 1),
('falha_eletrica', 1);

INSERT OR IGNORE INTO acoes_execucao_padrao (nome, ativo) VALUES
('inspecao', 1),
('limpeza', 1),
('reaperto', 1),
('alinhamento', 1),
('lubrificacao', 1),
('substituicao_peca', 1),
('regulagem', 1),
('solda', 1),
('fechamento', 1),
('teste_operacional', 1);

CREATE INDEX IF NOT EXISTS idx_os_ia_logs_os ON os_ia_logs(os_id);
CREATE INDEX IF NOT EXISTS idx_os_ia_logs_tipo ON os_ia_logs(tipo);
CREATE INDEX IF NOT EXISTS idx_os_sintoma_principal ON os(sintoma_principal);
