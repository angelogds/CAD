module.exports = function migrate({ db }) {
  const columns = db.prepare("PRAGMA table_info(tracagens)").all().map((item) => item.name);
  if (!columns.includes('os_linked_by')) db.exec('ALTER TABLE tracagens ADD COLUMN os_linked_by INTEGER');
  if (!columns.includes('os_linked_at')) db.exec('ALTER TABLE tracagens ADD COLUMN os_linked_at DATETIME');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tracagens_os_equipamento ON tracagens(os_id, equipamento_id)');
};
