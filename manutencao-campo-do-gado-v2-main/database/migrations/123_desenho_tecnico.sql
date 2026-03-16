PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS desenhos_tecnicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  categoria TEXT NOT NULL,
  subtipo TEXT NOT NULL,
  descricao TEXT,
  equipamento_id INTEGER REFERENCES equipamentos(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ATIVO',
  revisao INTEGER NOT NULL DEFAULT 0,
  material TEXT,
  observacoes TEXT,
  historico_revisao TEXT,
  criado_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_desenhos_categoria ON desenhos_tecnicos(categoria);
CREATE INDEX IF NOT EXISTS idx_desenhos_subtipo ON desenhos_tecnicos(subtipo);
CREATE INDEX IF NOT EXISTS idx_desenhos_status ON desenhos_tecnicos(status);
CREATE INDEX IF NOT EXISTS idx_desenhos_equipamento ON desenhos_tecnicos(equipamento_id);

CREATE TABLE IF NOT EXISTS desenho_entidades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  desenho_id INTEGER NOT NULL REFERENCES desenhos_tecnicos(id) ON DELETE CASCADE,
  tipo_entidade TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  camada TEXT,
  x REAL,
  y REAL,
  largura REAL,
  altura REAL,
  comprimento REAL,
  diametro REAL,
  raio REAL,
  angulo REAL,
  espessura REAL,
  rotacao REAL,
  props_json TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_entidades_desenho ON desenho_entidades(desenho_id);

CREATE TABLE IF NOT EXISTS desenho_cotas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  desenho_id INTEGER NOT NULL REFERENCES desenhos_tecnicos(id) ON DELETE CASCADE,
  tipo_cota TEXT NOT NULL,
  entidade_origem_id INTEGER REFERENCES desenho_entidades(id) ON DELETE SET NULL,
  x1 REAL,
  y1 REAL,
  x2 REAL,
  y2 REAL,
  valor REAL,
  texto TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cotas_desenho ON desenho_cotas(desenho_id);

CREATE TABLE IF NOT EXISTS desenho_arquivos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  desenho_id INTEGER NOT NULL REFERENCES desenhos_tecnicos(id) ON DELETE CASCADE,
  tipo_arquivo TEXT NOT NULL,
  svg_source TEXT,
  arquivo_pdf TEXT,
  preview_path TEXT,
  revisao INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_arquivos_desenho ON desenho_arquivos(desenho_id);

CREATE TABLE IF NOT EXISTS desenho_blocos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL,
  subtipo TEXT NOT NULL,
  descricao TEXT,
  definicao_json TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_blocos_categoria ON desenho_blocos(categoria, subtipo);

CREATE TABLE IF NOT EXISTS desenho_aplicacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  desenho_id INTEGER NOT NULL REFERENCES desenhos_tecnicos(id) ON DELETE CASCADE,
  equipamento_id INTEGER NOT NULL REFERENCES equipamentos(id) ON DELETE CASCADE,
  posicao_aplicacao TEXT,
  observacao TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_aplicacoes_desenho ON desenho_aplicacoes(desenho_id);
CREATE INDEX IF NOT EXISTS idx_aplicacoes_equipamento ON desenho_aplicacoes(equipamento_id);
