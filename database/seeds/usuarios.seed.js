// Mantém o ponto de entrada legado com a mesma política segura do seed principal.
const { ensureAdmin } = require('../seed');
function seedAdminIfMissing() {
  return ensureAdmin();
}
seedAdminIfMissing();
module.exports = { seedAdminIfMissing };
