const { normalizeWhatsapp } = require('../../utils/whatsapp-phone');

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function matchesAny(name, terms) {
  const normalized = normalizeName(name);
  return terms.some((term) => normalized.includes(normalizeName(term)));
}

module.exports = function up({ db, tableExists, columnExists, addColumnIfMissing }) {
  addColumnIfMissing('users', 'telefone_whatsapp', 'telefone_whatsapp TEXT');
  addColumnIfMissing('colaboradores', 'telefone_whatsapp', 'telefone_whatsapp TEXT');

  const targets = [
    { terms: ['Diogo'], phone: '5575982563752' },
    { terms: ['Salviano'], phone: '5575981966712' },
    { terms: ['Rodolfo'], phone: '5575991566685' },
    { terms: ['Luiz', 'Luís'], phone: '5575991634369' },
    { terms: ['Guarani'], phone: '5575991857441' },
    { terms: ['Junio', 'Júnio', 'Junior Feira', 'Júnior Feira'], phone: '5575982331550' },
  ].map((item) => ({ ...item, phone: normalizeWhatsapp(item.phone) }));

  const updatedUserIds = new Set();

  if (tableExists('colaboradores') && columnExists('colaboradores', 'telefone_whatsapp')) {
    const deletedFilter = columnExists('colaboradores', 'deleted_at') ? "WHERE COALESCE(deleted_at, '') = ''" : '';
    const userIdExpr = columnExists('colaboradores', 'user_id') ? 'user_id' : 'NULL AS user_id';
    const rows = db.prepare(`SELECT id, nome, apelido, ${userIdExpr} FROM colaboradores ${deletedFilter}`).all();
    const updateColaboradorSql = columnExists('colaboradores', 'updated_at')
      ? `UPDATE colaboradores SET telefone_whatsapp = ?, updated_at = datetime('now') WHERE id = ?`
      : `UPDATE colaboradores SET telefone_whatsapp = ? WHERE id = ?`;
    const updateColaborador = db.prepare(updateColaboradorSql);
    const updateUser = tableExists('users') && columnExists('users', 'telefone_whatsapp')
      ? db.prepare(`UPDATE users SET telefone_whatsapp = ? WHERE id = ?`)
      : null;

    for (const row of rows) {
      const target = targets.find((item) => matchesAny(`${row.nome || ''} ${row.apelido || ''}`, item.terms));
      if (!target) continue;
      updateColaborador.run(target.phone, Number(row.id));
      if (row.user_id && updateUser) {
        updateUser.run(target.phone, Number(row.user_id));
        updatedUserIds.add(Number(row.user_id));
      }
    }
  }

  if (tableExists('users') && columnExists('users', 'telefone_whatsapp')) {
    const rows = db.prepare(`SELECT id, name FROM users`).all();
    const updateUser = db.prepare(`UPDATE users SET telefone_whatsapp = ? WHERE id = ?`);
    for (const row of rows) {
      if (updatedUserIds.has(Number(row.id))) continue;
      const target = targets.find((item) => matchesAny(row.name, item.terms));
      if (!target) continue;
      updateUser.run(target.phone, Number(row.id));
    }
  }
};
