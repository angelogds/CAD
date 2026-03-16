PRAGMA foreign_keys = ON;

ALTER TABLE equipamentos ADD COLUMN foto_url TEXT;
ALTER TABLE equipamentos ADD COLUMN fabricante TEXT;
ALTER TABLE equipamentos ADD COLUMN ano_fabricacao INTEGER;
ALTER TABLE equipamentos ADD COLUMN ano_instalacao INTEGER;
ALTER TABLE equipamentos ADD COLUMN capacidade TEXT;
ALTER TABLE equipamentos ADD COLUMN pressao_trabalho TEXT;
ALTER TABLE equipamentos ADD COLUMN status_operacional TEXT DEFAULT 'ATIVO';
ALTER TABLE equipamentos ADD COLUMN observacao TEXT;

CREATE TABLE IF NOT EXISTS pecas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  modelo_descricao TEXT NOT NULL,
  codigo_interno TEXT,
  fabricante TEXT,
  observacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS equipamento_pecas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipamento_id INTEGER NOT NULL,
  peca_id INTEGER NOT NULL,
  aplicacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE,
  FOREIGN KEY (peca_id) REFERENCES pecas(id)
);

CREATE TABLE IF NOT EXISTS documentos_equipamento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipamento_id INTEGER NOT NULL,
  tipo_documento TEXT NOT NULL,
  descricao TEXT,
  caminho_arquivo TEXT NOT NULL,
  data_emissao TEXT,
  validade TEXT,
  responsavel TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS equipamento_qrcode (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipamento_id INTEGER NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pecas_tipo ON pecas(tipo);
CREATE INDEX IF NOT EXISTS idx_equipamento_pecas_equip ON equipamento_pecas(equipamento_id);
CREATE INDEX IF NOT EXISTS idx_docs_equipamento ON documentos_equipamento(equipamento_id);
CREATE INDEX IF NOT EXISTS idx_qr_token ON equipamento_qrcode(token);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_equipamento_pecas_assoc
ON equipamento_pecas(equipamento_id, peca_id, aplicacao);
