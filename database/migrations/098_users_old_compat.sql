-- 098_users_old_compat.sql
-- Compatibilidade: algumas FKs antigas ficaram apontando para users_old.
-- Solução: recria users_old (mínimo: id) e sincroniza com users via triggers.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS users_old (
  id INTEGER PRIMARY KEY
);

-- Garante que todos os usuários existentes também existam em users_old
INSERT OR IGNORE INTO users_old (id)
SELECT id FROM users;

-- Remove triggers antigos (se houver)
DROP TRIGGER IF EXISTS trg_users_ai_users_old;
DROP TRIGGER IF EXISTS trg_users_ad_users_old;
DROP TRIGGER IF EXISTS trg_users_au_users_old;

-- Sempre que criar usuário, replica id
CREATE TRIGGER trg_users_ai_users_old
AFTER INSERT ON users
BEGIN
  INSERT OR IGNORE INTO users_old (id) VALUES (NEW.id);
END;

-- Sempre que excluir usuário, remove da tabela compat
CREATE TRIGGER trg_users_ad_users_old
AFTER DELETE ON users
BEGIN
  DELETE FROM users_old WHERE id = OLD.id;
END;

-- Se (um dia) mudar ID, reflete também
CREATE TRIGGER trg_users_au_users_old
AFTER UPDATE OF id ON users
BEGIN
  UPDATE users_old SET id = NEW.id WHERE id = OLD.id;
END;

PRAGMA foreign_keys = ON;
