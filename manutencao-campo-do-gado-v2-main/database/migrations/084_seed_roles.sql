PRAGMA foreign_keys = ON;

-- garante coluna role (caso algum banco antigo não tenha)
-- (se já existe, não quebra)
-- SQLite não tem IF NOT EXISTS pra coluna; então deixe essa migration só se seu banco já tem role.
-- Se seu users já tem role, pode manter apenas como "documentação de roles".

-- ROLES esperados no sistema:
-- ADMIN
-- DIRECAO
-- ENCARREGADO_PRODUCAO
-- ALMOXARIFE
-- MECANICO
-- PRODUCAO
