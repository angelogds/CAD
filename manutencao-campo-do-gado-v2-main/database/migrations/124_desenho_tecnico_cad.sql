PRAGMA foreign_keys = ON;

ALTER TABLE desenhos_tecnicos ADD COLUMN tipo_origem TEXT NOT NULL DEFAULT 'parametrico';
ALTER TABLE desenhos_tecnicos ADD COLUMN modo_cad_ativo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE desenhos_tecnicos ADD COLUMN json_cad TEXT;
ALTER TABLE desenhos_tecnicos ADD COLUMN json_3d TEXT;
ALTER TABLE desenhos_tecnicos ADD COLUMN preview_3d_path TEXT;

CREATE INDEX IF NOT EXISTS idx_desenhos_tipo_origem ON desenhos_tecnicos(tipo_origem);

CREATE TABLE IF NOT EXISTS desenho_cad_objetos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  desenho_id INTEGER NOT NULL REFERENCES desenhos_tecnicos(id) ON DELETE CASCADE,
  tipo_objeto TEXT NOT NULL,
  camada TEXT NOT NULL DEFAULT 'geometria_principal',
  ordem INTEGER NOT NULL DEFAULT 0,
  x REAL,
  y REAL,
  x2 REAL,
  y2 REAL,
  largura REAL,
  altura REAL,
  raio REAL,
  angulo REAL,
  rotacao REAL,
  espessura REAL,
  texto TEXT,
  estilo_json TEXT,
  props_json TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_desenho_cad_objetos_desenho ON desenho_cad_objetos(desenho_id);

CREATE TABLE IF NOT EXISTS desenho_cad_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  desenho_id INTEGER NOT NULL REFERENCES desenhos_tecnicos(id) ON DELETE CASCADE,
  acao TEXT NOT NULL,
  payload_json TEXT,
  criado_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_desenho_cad_historico_desenho ON desenho_cad_historico(desenho_id);
