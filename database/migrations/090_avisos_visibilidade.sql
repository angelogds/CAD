PRAGMA foreign_keys = ON;

ALTER TABLE avisos ADD COLUMN visible_until TEXT;

CREATE INDEX IF NOT EXISTS idx_avisos_visible_until ON avisos(visible_until);
