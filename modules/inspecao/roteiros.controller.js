const service = require('./roteiros.service');
const pcm = require('../pcm/pcm.service');
const { normalizeRole } = require('../../config/rbac');
const dateBr = require('../../utils/data-hora-br');

const user = (req) => req.session?.user || null;
const baseUrl = (req) => service.canManage(user(req)) ? '/pcm/preventivas/roteiros' : '/inspecao/roteiros';

function viewData(req) {
  const gestor = service.canManage(user(req));
  return {
    layout: 'layout', title: 'Roteiro de inspeção', activeMenu: gestor ? 'pcm' : 'roteiro-inspecao',
    activePcmSection: 'preventivas', gestor, baseUrl: baseUrl(req), dateBr,
  };
}

function index(req, res) {
  const gestor = service.canManage(user(req));
  return res.render('inspecao/roteiros/index', {
    ...viewData(req), roteiros: service.listRoteiros(user(req)),
    mecanicos: gestor ? service.listMecanicos() : [],
    equipamentos: gestor ? pcm.listEquipamentosRoteiroBase() : [],
  });
}

function show(req, res, { draft = null, erroForm = null } = {}) {
  const roteiro = service.getRoteiro(req.params.id, user(req));
  const podeRegistrar = normalizeRole(user(req)?.role) === 'MECANICO' && roteiro.status === 'ABERTO';
  if (draft && podeRegistrar) {
    roteiro.itens = roteiro.itens.map((item) => ({ ...item,
      resultado: String(draft[`resultado_${item.id}`] || item.resultado || ''),
      orientacao_preventiva: String(draft[`preventiva_${item.id}`] ?? item.orientacao_preventiva ?? ''),
      orientacao_corretiva: String(draft[`corretiva_${item.id}`] ?? item.orientacao_corretiva ?? ''),
      observacao: String(draft[`observacao_${item.id}`] ?? item.observacao ?? ''),
      prioridade_sugerida: String(draft[`prioridade_${item.id}`] || item.prioridade_sugerida),
    }));
  }
  return res.render('inspecao/roteiros/show', {
    ...viewData(req), roteiro, podeRegistrar, erroForm,
    mecanicos: service.canManage(user(req)) ? service.listMecanicos() : [],
  });
}

function create(req, res) {
  const id = service.criarRoteiro(req.body || {}, user(req));
  req.flash('success', 'Roteiro distribuído ao mecânico. Nenhuma ordem de serviço foi gerada.');
  return res.redirect(`${baseUrl(req)}/${id}`);
}

function registrar(req, res) {
  const body = req.body || {};
  const ids = Array.isArray(body.item_ids) ? body.item_ids : body.item_ids == null ? [] : [body.item_ids];
  const registros = ids.map((id) => ({
    id, resultado: body[`resultado_${id}`], orientacao_preventiva: body[`preventiva_${id}`],
    orientacao_corretiva: body[`corretiva_${id}`], observacao: body[`observacao_${id}`], prioridade_sugerida: body[`prioridade_${id}`],
  }));
  service.registrarInspecoes(req.params.id, registros, body.acao === 'enviar', user(req));
  req.flash('success', body.acao === 'enviar' ? 'Roteiro enviado ao PCM para análise e definição das datas.' : 'Inspeções salvas. As indicações aguardam o envio ao PCM.');
  return res.redirect(`${baseUrl(req)}/${Number(req.params.id)}`);
}

function programar(req, res) {
  const result = service.analisarNecessidade(req.params.id, req.params.itemId, req.body || {}, user(req));
  req.flash('success', result.existente ? 'Esta indicação já foi analisada pelo PCM.' : result.osId ? `OS #${result.osId} criada e incluída na programação semanal do PCM.` : 'Indicação avaliada e não programada, com justificativa registrada.');
  return res.redirect(`${baseUrl(req)}/${Number(req.params.id)}#item-${Number(req.params.itemId)}`);
}

function concluir(req, res) {
  const alterado = service.concluirRoteiro(req.params.id, user(req));
  req.flash('success', alterado ? 'Roteiro concluído em uma única ação. Os serviços programados seguem em suas OS.' : 'Roteiro já concluído anteriormente.');
  return res.redirect(`${baseUrl(req)}/${Number(req.params.id)}`);
}

function wrap(fn, list = false) {
  return (req, res, next) => {
    try { return fn(req, res); }
    catch (error) {
      if ([403, 404].includes(error.status)) return res.status(error.status).render(`errors/${error.status}`, { layout: 'layout', title: 'Roteiro de inspeção', message: error.message });
      if (![400, 409].includes(error.status)) return next(error);
      if (fn === registrar && error.status === 400) return show(req, res.status(400), { draft: req.body, erroForm: error.message });
      req.flash('error', error.message);
      return res.redirect(list ? baseUrl(req) : `${baseUrl(req)}/${Number(req.params.id)}`);
    }
  };
}

module.exports = { index: wrap(index, true), show: wrap(show), create: wrap(create, true), registrar: wrap(registrar), programar: wrap(programar), concluir: wrap(concluir) };
