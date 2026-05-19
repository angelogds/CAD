const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRole } = require('../config/rbac');
const {
  AUTHORIZED_NOTIFICATION_ROLES,
  canSendWhatsappNotificationRole,
} = require('../middlewares/permissions.middleware');

test('notification roles are centralized and restricted to admin and maintenance lead', () => {
  assert.deepEqual(AUTHORIZED_NOTIFICATION_ROLES, ['ADMIN', 'ENCARREGADO_MANUTENCAO']);
  assert.equal(canSendWhatsappNotificationRole('ADMIN'), true);
  assert.equal(canSendWhatsappNotificationRole('admin'), true);
  assert.equal(canSendWhatsappNotificationRole('Administrador'), true);
  assert.equal(canSendWhatsappNotificationRole('encarregado'), true);
  assert.equal(canSendWhatsappNotificationRole('encarregado_manutencao'), true);
  assert.equal(canSendWhatsappNotificationRole('Encarregado de Manutenção'), true);
  assert.equal(canSendWhatsappNotificationRole('MECANICO'), false);
  assert.equal(canSendWhatsappNotificationRole('OPERADOR'), false);
  assert.equal(canSendWhatsappNotificationRole('SUPERVISOR_MANUTENCAO'), false);
});

test('normalizeRole canonicalizes notification role aliases', () => {
  assert.equal(normalizeRole('Administrador'), 'ADMIN');
  assert.equal(normalizeRole('Encarregado de Manutenção'), 'ENCARREGADO_MANUTENCAO');
  assert.equal(normalizeRole('encarregado-manutencao'), 'ENCARREGADO_MANUTENCAO');
});
