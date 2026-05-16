const { normalizeWhatsapp } = require('../../utils/whatsapp-phone');

function normalizePersonName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\bluis\b/g, 'luiz');
}

function isBlank(value) {
  return !String(value || '').trim();
}

module.exports = function up({ db, tableExists, columnExists, addColumnIfMissing }) {
  addColumnIfMissing('users', 'telefone_whatsapp', 'telefone_whatsapp TEXT');
  addColumnIfMissing('colaboradores', 'telefone_whatsapp', 'telefone_whatsapp TEXT');
  addColumnIfMissing('colaboradores', 'user_id', 'user_id INTEGER');

  if (!tableExists('users') || !tableExists('colaboradores')) return;
  if (!columnExists('users', 'telefone_whatsapp') || !columnExists('colaboradores', 'telefone_whatsapp')) return;

  const userNameColumn = columnExists('users', 'name') ? 'name' : (columnExists('users', 'nome') ? 'nome' : null);
  const colaboradorNameColumn = columnExists('colaboradores', 'nome') ? 'nome' : (columnExists('colaboradores', 'name') ? 'name' : null);
  if (!userNameColumn || !colaboradorNameColumn) return;

  const users = db.prepare(`SELECT id, ${userNameColumn} AS nome, telefone_whatsapp FROM users`).all();
  const usersByName = new Map();
  for (const user of users) {
    const key = normalizePersonName(user.nome);
    const phone = normalizeWhatsapp(user.telefone_whatsapp || '');
    if (!key || !phone) continue;
    const current = usersByName.get(key);
    if (!current || Number(user.id) < Number(current.id)) usersByName.set(key, { ...user, telefone_whatsapp: phone });
  }

  if (!usersByName.size) return;

  const deletedFilter = columnExists('colaboradores', 'deleted_at') ? "WHERE COALESCE(deleted_at, '') = ''" : '';
  const hasUserId = columnExists('colaboradores', 'user_id');
  const colaboradores = db.prepare(`
    SELECT id, ${colaboradorNameColumn} AS nome, telefone_whatsapp${hasUserId ? ', user_id' : ''}
    FROM colaboradores
    ${deletedFilter}
  `).all();

  const setParts = [];
  if (hasUserId) setParts.push('user_id = CASE WHEN user_id IS NULL OR user_id = 0 THEN @user_id ELSE user_id END');
  setParts.push("telefone_whatsapp = CASE WHEN telefone_whatsapp IS NULL OR trim(telefone_whatsapp) = '' THEN @telefone_whatsapp ELSE telefone_whatsapp END");
  if (columnExists('colaboradores', 'updated_at')) setParts.push("updated_at = datetime('now')");
  const updateColaborador = db.prepare(`UPDATE colaboradores SET ${setParts.join(', ')} WHERE id = @id`);

  const updateUser = db.prepare(`
    UPDATE users
    SET telefone_whatsapp = CASE WHEN telefone_whatsapp IS NULL OR trim(telefone_whatsapp) = '' THEN @telefone_whatsapp ELSE telefone_whatsapp END
    WHERE id = @user_id
  `);

  for (const colaborador of colaboradores) {
    const user = usersByName.get(normalizePersonName(colaborador.nome));
    if (!user) continue;
    const telefone = normalizeWhatsapp(colaborador.telefone_whatsapp || '') || user.telefone_whatsapp;
    const shouldLink = hasUserId && (!colaborador.user_id || Number(colaborador.user_id) === 0);
    const shouldCopyPhone = isBlank(colaborador.telefone_whatsapp) && telefone;
    if (!shouldLink && !shouldCopyPhone) continue;

    updateColaborador.run({ id: Number(colaborador.id), user_id: Number(user.id), telefone_whatsapp: telefone });
    updateUser.run({ user_id: Number(user.id), telefone_whatsapp: telefone });
  }
};
