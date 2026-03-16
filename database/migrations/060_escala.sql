PRAGMA foreign_keys = ON;

-- ===== COLABORADORES =====
CREATE TABLE IF NOT EXISTS colaboradores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  funcao TEXT NOT NULL DEFAULT 'mecanico',  -- mecanico | apoio | etc
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1))
);

CREATE INDEX IF NOT EXISTS idx_colaboradores_ativo ON colaboradores(ativo);


-- ===== ESCALA: PERÍODO (vigência) =====
CREATE TABLE IF NOT EXISTS escala_periodos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  vigencia_inicio TEXT NOT NULL,       -- YYYY-MM-DD
  vigencia_fim TEXT NOT NULL,          -- YYYY-MM-DD
  regra_texto TEXT,
  intervalo_tecnico TEXT,              -- "17h–19h"
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (vigencia_inicio <= vigencia_fim)
);

CREATE INDEX IF NOT EXISTS idx_escala_periodos_vigencia
  ON escala_periodos(vigencia_inicio, vigencia_fim);


-- ===== ESCALA: SEMANAS DO PERÍODO =====
CREATE TABLE IF NOT EXISTS escala_semanas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL,
  semana_numero INTEGER NOT NULL,
  data_inicio TEXT NOT NULL,           -- YYYY-MM-DD
  data_fim TEXT NOT NULL,              -- YYYY-MM-DD
  UNIQUE(periodo_id, semana_numero),
  CHECK (data_inicio <= data_fim),
  FOREIGN KEY(periodo_id) REFERENCES escala_periodos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_escala_semanas_periodo ON escala_semanas(periodo_id);


-- ===== ESCALA: ALOCAÇÕES =====
CREATE TABLE IF NOT EXISTS escala_alocacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  semana_id INTEGER NOT NULL,
  tipo_turno TEXT NOT NULL,            -- noturno | diurno | apoio | folga | plantao
  horario_inicio TEXT,                 -- "19:00" / "07:00" (pode ser NULL em folga)
  horario_fim TEXT,                    -- "05:00" / "17:00"
  colaborador_id INTEGER NOT NULL,
  observacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(semana_id) REFERENCES escala_semanas(id) ON DELETE CASCADE,
  FOREIGN KEY(colaborador_id) REFERENCES colaboradores(id),
  CHECK (tipo_turno IN ('noturno','diurno','apoio','folga','plantao'))
);

-- Evita duplicar o mesmo colaborador no mesmo turno na mesma semana
CREATE UNIQUE INDEX IF NOT EXISTS uidx_escala_alocacoes_unica
  ON escala_alocacoes(semana_id, tipo_turno, colaborador_id);

CREATE INDEX IF NOT EXISTS idx_escala_alocacoes_semana ON escala_alocacoes(semana_id);
CREATE INDEX IF NOT EXISTS idx_escala_alocacoes_colab ON escala_alocacoes(colaborador_id);


-- ===== AUDITORIA (opcional, mas excelente) =====
CREATE TABLE IF NOT EXISTS escala_auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entidade TEXT NOT NULL,              -- 'escala_alocacoes' etc
  entidade_id INTEGER NOT NULL,
  acao TEXT NOT NULL,                  -- 'create' | 'update' | 'delete'
  antes_json TEXT,
  depois_json TEXT,
  usuario TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_escala_auditoria_entidade
  ON escala_auditoria(entidade, entidade_id);
