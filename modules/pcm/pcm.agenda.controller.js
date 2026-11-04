const service = require('./pcm.agenda.service');
const dateBr = require('../../utils/data-hora-br');

function viewData(req, compartilhada = false) {
  const user = req.session.user;
  const base = service.semana(req.query.semana_inicio || req.query.semana);
  const filtros = {
    busca: String(req.query.busca || '').trim().slice(0, 120),
    origem: ['SERVICO', 'INSTALACAO', 'OS'].includes(req.query.origem) ? req.query.origem : '',
    responsavel: String(req.query.responsavel || ''),
    status: ['PROGRAMADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'].includes(req.query.status) ? req.query.status : '',
  };
  const eventos = service.listEventos(base, user).filter(item =>
    (!filtros.origem || item.etapa === filtros.origem) &&
    (!filtros.responsavel || String(item.responsavel_user_id) === filtros.responsavel) &&
    (!filtros.status || item.status === filtros.status) &&
    (!filtros.busca || `${item.demanda_id} ${item.titulo} ${item.equipamento || ''} ${item.local_servico}`.toLocaleLowerCase('pt-BR').includes(filtros.busca.toLocaleLowerCase('pt-BR'))));
  return {
    compartilhada,
    agendaEventos: eventos,
    demandasPendentes: !compartilhada && service.canManage(user) ? service.listPendentes(user, filtros.busca) : [],
    equipeAgenda: !compartilhada ? service.equipe() : [],
    agendaFiltros: filtros,
    hojeAgenda: dateBr.todayISO(),
    semanaAgenda: base,
  };
}

function agenda(req, res, next) {
  try {
    const dados = viewData(req, true);
    return res.render('pcm/programacao-semanal', {
      ...dados, title: 'Agenda de serviços e instalações', activeMenu: 'agenda-servicos', activePcmSection: '',
      canManagePcm: false,
      programacao: { ...dados.semanaAgenda, itens: [], mecanicos: [] },
      atividadesSemProgramacao: [],
    });
  } catch (error) { return next(error); }
}

function destino(data, id) {
  const query = new URLSearchParams();
  if (dateBr.isValidISODate(String(data || ''))) query.set('semana_inicio', data);
  return `/pcm/programacao-semanal${query.size ? `?${query}` : ''}${id ? `#agenda-${id}` : ''}`;
}

function programar(req, res) {
  try {
    const evento = service.programar(req.params.demandaId, req.body, req.session.user);
    req.flash('success', evento.alterado ? 'Programação salva. Os perfis envolvidos receberam o aviso no aplicativo.' : 'Esta programação já está salva.');
    return res.redirect(destino(evento.data_programada, evento.id));
  } catch (error) {
    req.flash('error', error.message);
    return res.redirect(destino(req.body.semana_inicio));
  }
}

function status(req, res) {
  try {
    const evento = service.alterarStatus(req.params.id, req.body, req.session.user);
    req.flash('success', evento.alterado ? 'Etapa atualizada e equipe avisada.' : 'Esta situação já foi registrada.');
    return res.redirect(destino(evento.data_programada, evento.id));
  } catch (error) {
    req.flash('error', error.message);
    return res.redirect(destino(req.body.semana_inicio));
  }
}

function instalacao(req, res) {
  const id = Number(req.params.demandaId);
  try {
    service.marcarInstalacao(id, req.body.requer_instalacao, req.session.user);
    req.flash('success', 'Instalação posterior atualizada. Após concluir a fabricação, programe a instalação no PCM.');
  } catch (error) { req.flash('error', error.message); }
  return res.redirect(`/demandas/${id}`);
}

function marcarLidas(req, res) {
  service.marcarLidas(req.session.user);
  req.flash('success', 'Avisos da agenda marcados como lidos.');
  return res.redirect('/pcm/agenda');
}

module.exports = { viewData, agenda, programar, status, instalacao, marcarLidas };
