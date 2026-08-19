const service = require('./avisos.service');
const { ACCESS, normalizeRole } = require('../../config/rbac');

function can(user, key) { return (ACCESS[key] || []).includes(normalizeRole(user?.role)); }
function redirectWith(req, res, type, message) { req.flash(type, message); return res.redirect('/avisos'); }
function currentFilters(req) { return { busca:req.query.busca||'', categoria:req.query.categoria||'', prioridade:req.query.prioridade||'', status:req.query.status||'', periodo:req.query.periodo||'' }; }

function index(req, res) {
  const filtros = currentFilters(req);
  const page = Number(req.query.page || 1);
  const perPage = Number(req.query.per_page || 20);
  const listagem = service.listAvisos(filtros, { page, perPage });
  return res.render('avisos/index', {
    title:'Avisos', activeMenu:'avisos', avisos:listagem.items, listagem, filtros,
    metrics:service.getDashboardMetrics(), categorias:service.CATEGORIAS, prioridades:service.PRIORIDADES, statusLabels:service.STATUS,
    categoriasResumo:service.getCategorySummary(), recentes:service.getRecentAvisos(5), agendados:service.getUpcomingAvisos(5),
    canManageAvisos:can(req.session?.user,'avisos_manage'), canDeleteAvisos:can(req.session?.user,'avisos_delete'),
  });
}

function create(req,res){ try { const id=service.createAviso(req.body,req.session?.user?.id); const status=String(req.body.status||'PUBLICADO').toUpperCase(); return redirectWith(req,res,'success',status==='RASCUNHO'?`Rascunho #${id} salvo.`:status==='AGENDADO'?`Aviso #${id} agendado com sucesso.`:`Aviso #${id} publicado com sucesso.`); } catch(err){ return redirectWith(req,res,'error',err.message||'Não foi possível salvar o aviso.'); } }
function update(req,res){ try { service.updateAviso(req.params.id,req.body,req.session?.user?.id); return redirectWith(req,res,'success','Aviso atualizado com sucesso.'); } catch(err){ return redirectWith(req,res,'error',err.message||'Não foi possível atualizar o aviso.'); } }
function publishNow(req,res){ try { service.publishNow(req.params.id); return redirectWith(req,res,'success','Aviso publicado agora.'); } catch(err){ return redirectWith(req,res,'error',err.message||'Não foi possível publicar o aviso.'); } }
function cancelSchedule(req,res){ try { service.cancelSchedule(req.params.id); return redirectWith(req,res,'success','Agendamento cancelado e aviso movido para rascunho.'); } catch(err){ return redirectWith(req,res,'error',err.message||'Não foi possível cancelar o agendamento.'); } }
function duplicate(req,res){ try { service.duplicateAviso(req.params.id,req.session?.user?.id); return redirectWith(req,res,'success','Cópia criada como rascunho.'); } catch(err){ return redirectWith(req,res,'error',err.message||'Não foi possível duplicar o aviso.'); } }
function remove(req,res){ const changes=service.deleteAviso(req.params.id); return redirectWith(req,res,changes?'success':'error',changes?'Aviso excluído com sucesso.':'Aviso não encontrado.'); }

module.exports={index,create,update,publishNow,cancelSchedule,duplicate,remove};
