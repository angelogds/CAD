PRAGMA foreign_keys = ON;

-- Liga colaboradores ao users (para “mecânico por perfil”)
ALTER TABLE colaboradores ADD COLUMN user_id INTEGER;

-- Evita duplicar vínculo
CREATE UNIQUE INDEX IF NOT EXISTS uidx_colaboradores_user_id
ON colaboradores(user_id)
WHERE user_id IS NOT NULL;
