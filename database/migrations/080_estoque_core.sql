PRAGMA foreign_keys = ON;

-- =====================================================
-- GARANTE QUE A TABELA estoque_itens EXISTA
-- =====================================================

CREATE TABLE IF NOT EXISTS estoque_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'DIVERSOS',
  unidade TEXT NOT NULL DEFAULT 'UN',
  estoque_min REAL NOT NULL DEFAULT 0,
  custo_unit REAL NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

-- =====================================================
-- GARANTE QUE A COLUNA categoria EXISTA (BANCO ANTIGO)
-- =====================================================

-- SQLite não tem IF NOT EXISTS para coluna,
-- então criamos uma tabela temporária se precisar

-- Verifica estrutura existente
-- Se a coluna não existir, ela será adicionada via migrate.js
-- (evita erro de recriação da tabela)

-- =====================================================
-- ÍNDICES SEGUROS
-- =====================================================

CREATE UNIQUE INDEX IF NOT EXISTS uidx_estoque_itens_codigo 
ON estoque_itens(codigo);

CREATE INDEX IF NOT EXISTS idx_estoque_itens_nome 
ON estoque_itens(nome);

CREATE INDEX IF NOT EXISTS idx_estoque_itens_categoria 
ON estoque_itens(categoria);

CREATE INDEX IF NOT EXISTS idx_estoque_itens_ativo 
ON estoque_itens(ativo);

-- =====================================================
-- TABELA DE MOVIMENTOS
-- =====================================================

CREATE TABLE IF NOT EXISTS estoque_movimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,                 
  quantidade REAL NOT NULL,           
  custo_unit REAL,                    
  origem TEXT NOT NULL DEFAULT 'AJUSTE',
  referencia_id INTEGER,
  observacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(item_id) REFERENCES estoque_itens(id)
);

CREATE INDEX IF NOT EXISTS idx_estoque_mov_item 
ON estoque_movimentos(item_id);

CREATE INDEX IF NOT EXISTS idx_estoque_mov_tipo 
ON estoque_movimentos(tipo);

CREATE INDEX IF NOT EXISTS idx_estoque_mov_created 
ON estoque_movimentos(created_at);
