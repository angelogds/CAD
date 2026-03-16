PRAGMA foreign_keys = ON;

ALTER TABLE notificacoes_os ADD COLUMN lida INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notificacoes_os ADD COLUMN reconhecida INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notificacoes_os ADD COLUMN reconhecida_em TEXT;

CREATE INDEX IF NOT EXISTS idx_notif_os_reconhecida ON notificacoes_os(reconhecida, created_at DESC);
