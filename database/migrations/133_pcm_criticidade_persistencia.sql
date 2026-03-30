-- 133_pcm_criticidade_persistencia.sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pcm_equipamento_criticidade (
  equipamento_id INTEGER PRIMARY KEY,
  nivel_criticidade TEXT NOT NULL DEFAULT 'MEDIA',
  impacto_producao INTEGER NOT NULL DEFAULT 3,
  impacto_seguranca INTEGER NOT NULL DEFAULT 3,
  impacto_ambiental INTEGER NOT NULL DEFAULT 3,
  custo_parada INTEGER NOT NULL DEFAULT 3,
  indice_criticidade REAL NOT NULL DEFAULT 3,
  observacoes TEXT,
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_pcm_criticidade_nivel
  ON pcm_equipamento_criticidade(nivel_criticidade);

INSERT INTO pcm_equipamento_criticidade (
  equipamento_id,
  nivel_criticidade,
  impacto_producao,
  impacto_seguranca,
  impacto_ambiental,
  custo_parada,
  indice_criticidade,
  updated_at
)
SELECT
  e.id,
  CASE
    WHEN UPPER(COALESCE(e.criticidade,'')) IN ('ALTA','MEDIA','BAIXA') THEN UPPER(e.criticidade)
    ELSE 'MEDIA'
  END,
  3,
  3,
  3,
  3,
  3,
  datetime('now')
FROM equipamentos e
WHERE NOT EXISTS (
  SELECT 1
  FROM pcm_equipamento_criticidade c
  WHERE c.equipamento_id = e.id
);
