ALTER TABLE tracagens ADD COLUMN pdf_filename TEXT;
ALTER TABLE tracagens ADD COLUMN pdf_path TEXT;
ALTER TABLE tracagens ADD COLUMN pdf_generated_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_tracagens_equipamento_created_at ON tracagens(equipamento_id, created_at DESC);
