PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS escala_horas_extras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  colaborador_id INTEGER NOT NULL,
  os_id INTEGER,
  equipamento_id INTEGER,
  data_servico TEXT NOT NULL,
  inicio_extra TEXT NOT NULL,
  fim_extra TEXT,
  total_minutos INTEGER DEFAULT 0,
  descricao_servico TEXT NOT NULL,
  foto_inicio_path TEXT,
  foto_fim_path TEXT,
  latitude_inicio REAL,
  longitude_inicio REAL,
  precisao_inicio REAL,
  latitude_fim REAL,
  longitude_fim REAL,
  precisao_fim REAL,
  status TEXT NOT NULL DEFAULT 'EM_ANDAMENTO' CHECK (status IN ('EM_ANDAMENTO','PENDENTE_APROVACAO','APROVADO','REPROVADO','CANCELADO','COMPENSADO')),
  aprovado_por INTEGER,
  aprovado_em TEXT,
  observacao_aprovacao TEXT,
  motivo_reprovacao TEXT,
  motivo_cancelamento TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(colaborador_id) REFERENCES colaboradores(id),
  FOREIGN KEY(os_id) REFERENCES os(id),
  FOREIGN KEY(equipamento_id) REFERENCES equipamentos(id),
  FOREIGN KEY(aprovado_por) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_escala_horas_extras_colaborador ON escala_horas_extras(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_escala_horas_extras_status ON escala_horas_extras(status);
CREATE INDEX IF NOT EXISTS idx_escala_horas_extras_data ON escala_horas_extras(data_servico);
CREATE INDEX IF NOT EXISTS idx_escala_horas_extras_os ON escala_horas_extras(os_id);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_escala_horas_extras_aberta ON escala_horas_extras(colaborador_id) WHERE status = 'EM_ANDAMENTO';

CREATE TABLE IF NOT EXISTS escala_banco_horas_movimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  colaborador_id INTEGER NOT NULL,
  hora_extra_id INTEGER,
  folga_id INTEGER,
  tipo TEXT NOT NULL CHECK (tipo IN ('CREDITO_HORA_EXTRA','DEBITO_FOLGA','AJUSTE_CREDITO','AJUSTE_DEBITO','CANCELAMENTO')),
  minutos INTEGER NOT NULL,
  data_movimento TEXT NOT NULL,
  descricao TEXT,
  criado_por INTEGER,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(colaborador_id) REFERENCES colaboradores(id),
  FOREIGN KEY(hora_extra_id) REFERENCES escala_horas_extras(id),
  FOREIGN KEY(folga_id) REFERENCES escala_folgas_programadas(id),
  FOREIGN KEY(criado_por) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_escala_banco_horas_colaborador ON escala_banco_horas_movimentos(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_escala_banco_horas_tipo ON escala_banco_horas_movimentos(tipo);
CREATE INDEX IF NOT EXISTS idx_escala_banco_horas_data ON escala_banco_horas_movimentos(data_movimento);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_escala_banco_credito_hora_extra ON escala_banco_horas_movimentos(hora_extra_id, tipo) WHERE tipo = 'CREDITO_HORA_EXTRA';

CREATE TABLE IF NOT EXISTS escala_folgas_programadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  colaborador_id INTEGER NOT NULL,
  data_folga TEXT NOT NULL,
  minutos_descontados INTEGER NOT NULL,
  motivo TEXT,
  status TEXT NOT NULL DEFAULT 'PROGRAMADA' CHECK (status IN ('PROGRAMADA','REALIZADA','CANCELADA')),
  aprovado_por INTEGER,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(colaborador_id) REFERENCES colaboradores(id),
  FOREIGN KEY(aprovado_por) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_escala_folgas_colaborador ON escala_folgas_programadas(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_escala_folgas_data ON escala_folgas_programadas(data_folga);
CREATE INDEX IF NOT EXISTS idx_escala_folgas_status ON escala_folgas_programadas(status);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_escala_folgas_programadas_dia ON escala_folgas_programadas(colaborador_id, data_folga) WHERE status <> 'CANCELADA';
