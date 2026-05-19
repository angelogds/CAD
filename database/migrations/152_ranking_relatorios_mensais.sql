CREATE TABLE IF NOT EXISTS ranking_relatorios_mensais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mes_referencia TEXT NOT NULL UNIQUE,
  data_inicio TEXT NOT NULL,
  data_fim TEXT NOT NULL,
  caminho_pdf TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  gerado_por TEXT NOT NULL DEFAULT 'sistema',
  status TEXT NOT NULL DEFAULT 'gerado',
  observacoes TEXT
);

CREATE INDEX IF NOT EXISTS idx_ranking_relatorios_mensais_mes
  ON ranking_relatorios_mensais(mes_referencia);
