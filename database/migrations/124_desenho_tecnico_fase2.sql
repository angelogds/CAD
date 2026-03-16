PRAGMA foreign_keys = ON;

ALTER TABLE desenho_entidades ADD COLUMN visivel INTEGER NOT NULL DEFAULT 1;
ALTER TABLE desenho_entidades ADD COLUMN bloqueado INTEGER NOT NULL DEFAULT 0;
ALTER TABLE desenho_entidades ADD COLUMN estilo_json TEXT;

CREATE TABLE IF NOT EXISTS desenho_camadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  desenho_id INTEGER NOT NULL REFERENCES desenhos_tecnicos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  slug TEXT NOT NULL,
  cor_ref TEXT,
  tipo_linha TEXT,
  espessura_ref REAL,
  visivel INTEGER NOT NULL DEFAULT 1,
  bloqueado INTEGER NOT NULL DEFAULT 0,
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(desenho_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_desenho_camadas_desenho ON desenho_camadas(desenho_id);

ALTER TABLE desenho_blocos ADD COLUMN origem_desenho_id INTEGER REFERENCES desenhos_tecnicos(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS desenho_bloco_instancias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  desenho_id INTEGER NOT NULL REFERENCES desenhos_tecnicos(id) ON DELETE CASCADE,
  bloco_id INTEGER NOT NULL REFERENCES desenho_blocos(id) ON DELETE RESTRICT,
  nome_instancia TEXT,
  x REAL NOT NULL,
  y REAL NOT NULL,
  escala REAL NOT NULL DEFAULT 1,
  rotacao REAL NOT NULL DEFAULT 0,
  camada TEXT NOT NULL DEFAULT 'geometria_principal',
  props_override_json TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bloco_instancias_desenho ON desenho_bloco_instancias(desenho_id);

ALTER TABLE desenho_cotas ADD COLUMN camada TEXT NOT NULL DEFAULT 'cotas';
ALTER TABLE desenho_cotas ADD COLUMN x3 REAL;
ALTER TABLE desenho_cotas ADD COLUMN y3 REAL;
ALTER TABLE desenho_cotas ADD COLUMN unidade TEXT;
ALTER TABLE desenho_cotas ADD COLUMN angulo_ref REAL;
ALTER TABLE desenho_cotas ADD COLUMN estilo_json TEXT;

ALTER TABLE desenhos_tecnicos ADD COLUMN origem_modulo TEXT;
ALTER TABLE desenhos_tecnicos ADD COLUMN origem_referencia TEXT;
ALTER TABLE desenhos_tecnicos ADD COLUMN origem_integracao_em TEXT;

INSERT INTO desenho_blocos (nome, categoria, subtipo, descricao, definicao_json, ativo, criado_em, atualizado_em)
SELECT 'Ponta de eixo principal', 'EIXOS', 'PONTA_EIXO_PRINCIPAL', 'Bloco padrão industrial para ponta de eixo principal.', '{"entidades":[{"tipo":"shaft","camada":"geometria_principal"}],"params":{"assento1":60,"assento2":45,"encosto":80}}', 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM desenho_blocos WHERE nome='Ponta de eixo principal');

INSERT INTO desenho_blocos (nome, categoria, subtipo, descricao, definicao_json, ativo, criado_em, atualizado_em)
SELECT 'Flange com furação', 'FLANGES', 'FLANGE_FURACAO', 'Flange com padrão de furos para biblioteca técnica.', '{"entidades":[{"tipo":"flange","camada":"geometria_principal"},{"tipo":"furos","camada":"furos"}],"params":{"diametroExterno":180,"diametroInterno":90,"numeroFuros":8,"diametroFuros":14}}', 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM desenho_blocos WHERE nome='Flange com furação');

INSERT INTO desenho_blocos (nome, categoria, subtipo, descricao, definicao_json, ativo, criado_em, atualizado_em)
SELECT 'Mão francesa padrão', 'ESTRUTURAS', 'MAO_FRANCESA', 'Estrutura triangular padrão para suporte.', '{"entidades":[{"tipo":"bracket","camada":"geometria_principal"}],"params":{"base":220,"altura":140}}', 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM desenho_blocos WHERE nome='Mão francesa padrão');
