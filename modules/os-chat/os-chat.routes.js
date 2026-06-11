const router = require('express').Router();
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./os-chat.controller');

const read = ACCESS.os_chat_read;
const write = ACCESS.os_chat_write;

router.get('/api/nao-lidas', requireLogin, requireRole(read), ctrl.apiNaoLidas);
router.get('/api/notificacoes', requireLogin, requireRole(read), ctrl.apiNotificacoes);
router.get('/', requireLogin, requireRole(read), ctrl.index);
router.get('/:osId/mensagens', requireLogin, requireRole(read), ctrl.apiMensagens);
router.get('/:osId', requireLogin, requireRole(read), ctrl.show);
router.post('/:osId/mensagens', requireLogin, requireRole(write), ctrl.enviarMensagem);
router.post('/:osId/lida', requireLogin, requireRole(read), ctrl.marcarLida);

module.exports = router;
