const service = require('./os-chat.service');
const { fmtBR } = require('../../utils/date');

const filtros = [
  ['todas', 'Todas'], ['nao_lidas', 'Não lidas'], ['aguardando_material', 'Aguardando material'],
  ['aguardando_compras', 'Aguardando compras'], ['aguardando_manutencao', 'Aguardando manutenção'],
  ['aguardando_inspecao', 'Aguardando inspeção'], ['criticas', 'Críticas'], ['em_andamento', 'Em andamento'],
  ['finalizadas_recentes', 'Finalizadas recentemente'],
];

function wantsJson(req) {
  return req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest' || (req.accepts('json') && !req.accepts('html'));
}

function serializeMensagem(mensagem) {
  return {
    ...mensagem,
    created_at_fmt: mensagem.created_at ? fmtBR(mensagem.created_at) : '-',
  };
}

function index(req, res) {
  const filtro = req.query.filtro || 'todas';
  const conversas = service.listarConversasOS(req.session.user, { filtro });
  return res.render('os-chat/index', { title: 'Chat de OS', activeMenu: 'os-chat', conversas, filtro, filtros, user: req.session.user });
}
function show(req, res) {
  const osId = Number(req.params.osId);
  const conversa = service.buscarConversaPorOS(osId, req.session.user);
  if (!conversa) return res.status(404).render('errors/404', { title: 'OS não encontrada' });
  service.marcarComoLida(osId, req.session.user.id);
  const conversas = service.listarConversasOS(req.session.user, { filtro: req.query.filtro || 'todas' });
  return res.render('os-chat/show', { title: `Chat OS #${osId}`, activeMenu: 'os-chat', conversa, conversas, filtro: req.query.filtro || 'todas', filtros, user: req.session.user });
}
function apiMensagens(req, res) {
  const osId = Number(req.params.osId);
  const conversa = service.buscarConversaPorOS(osId, req.session.user);
  if (!conversa) return res.status(404).json({ ok: false, error: 'OS não encontrada.' });
  service.marcarComoLida(osId, req.session.user.id);
  return res.json({ ok: true, mensagens: conversa.mensagens.map(serializeMensagem) });
}
function enviarMensagem(req, res) {
  const osId = Number(req.params.osId);
  try {
    const mensagem = service.enviarMensagem(osId, req.session.user, req.body?.mensagem);
    if (wantsJson(req)) return res.json({ ok: true, messageId: mensagem.id, mensagem: serializeMensagem(mensagem) });
    req.flash('success', 'Mensagem registrada na conversa da OS.');
  } catch (err) {
    if (wantsJson(req)) return res.status(400).json({ ok: false, error: err.message || 'Não foi possível salvar a mensagem.' });
    req.flash('error', err.message || 'Não foi possível enviar a mensagem.');
  }
  return res.redirect(`/chat-os/${osId}`);
}
function marcarLida(req, res) {
  const osId = Number(req.params.osId);
  service.marcarComoLida(osId, req.session.user.id);
  if (req.accepts('json') && !req.accepts('html')) return res.json({ ok: true });
  return res.redirect(`/chat-os/${osId}`);
}
function apiNaoLidas(req, res) { return res.json({ total: service.contarNaoLidas(req.session.user.id) }); }
function apiNotificacoes(req, res) { return res.json({ notificacoes: service.listarNotificacoesChat(req.session.user.id) }); }

module.exports = { index, show, apiMensagens, enviarMensagem, marcarLida, apiNaoLidas, apiNotificacoes };
