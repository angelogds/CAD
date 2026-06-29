CREATE TABLE IF NOT EXISTS escala_rodizio_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  data_inicio TEXT NOT NULL,
  data_fim TEXT,
  tamanho_ciclo INTEGER NOT NULL DEFAULT 3,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_por INTEGER,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT,
  FOREIGN KEY(criado_por) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS escala_rodizio_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_id INTEGER NOT NULL,
  posicao INTEGER NOT NULL,
  colaborador_id INTEGER NOT NULL,
  turno TEXT NOT NULL DEFAULT 'NOITE',
  ativo INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(config_id) REFERENCES escala_rodizio_config(id),
  FOREIGN KEY(colaborador_id) REFERENCES colaboradores(id)
);

CREATE TABLE IF NOT EXISTS escala_diurno_fixos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_id INTEGER NOT NULL,
  colaborador_id INTEGER NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(config_id) REFERENCES escala_rodizio_config(id),
  FOREIGN KEY(colaborador_id) REFERENCES colaboradores(id)
);

CREATE INDEX IF NOT EXISTS idx_escala_rodizio_config_ativo ON escala_rodizio_config(ativo, data_inicio, data_fim);
CREATE INDEX IF NOT EXISTS idx_escala_rodizio_itens_config ON escala_rodizio_itens(config_id, posicao, ativo);
CREATE INDEX IF NOT EXISTS idx_escala_diurno_fixos_config ON escala_diurno_fixos(config_id, ativo);
