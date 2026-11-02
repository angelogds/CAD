const router = require('express').Router();
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const configuration = require('../compras/compras.configuracao.service');

router.get('/configuracoes/perfis', requireLogin, requireRole(['ADMIN']), (req, res) => {
  try {
    return res.render('admin/perfis', {
      title: 'Configurações por perfil',
      activeMenu: 'admin-perfis',
      approvalRequired: configuration.isApprovalRequired(),
      history: configuration.getHistory(),
    });
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível carregar as configurações por perfil.');
    return res.redirect('/meu-portal/configuracoes');
  }
});

router.post('/configuracoes/perfis', requireLogin, requireRole(['ADMIN']), (req, res) => {
  try {
    const required = configuration.setApprovalRequired({
      perfil: req.body?.perfil,
      obrigatoria: req.body?.obrigatoria,
      user: req.session.user,
    });
    req.flash('success', required
      ? 'Acompanhamento da Diretoria ativado: itens ainda não comprados exigem aprovação digital.'
      : 'Acompanhamento da Diretoria desativado: Compras pode cotar e marcar como comprado. Diretoria mantém a consulta.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível salvar a configuração.');
  }
  return res.redirect('/admin/configuracoes/perfis');
});

module.exports = router;
