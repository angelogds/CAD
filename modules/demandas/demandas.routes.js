const express = require('express');
const router = express.Router();
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./demandas.controller');
const service = require('./demandas.service');

const SOLICITACAO_TERMINAL = new Set(['FECHADA', 'CANCELADA', 'REPROVADA']);
const OS_TERMINAL = new Set(['FECHADA', 'CONCLUIDA', 'FINALIZADA', 'CANCELADA']);

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function getDashboardResumo(req, res) {
  try {
    const demandas = service.list({ tab: 'ATIVAS', limit: 20 }, req.session?.user || {});
    const statusRank = {
      EM_ANDAMENTO: 0,
      PARADA: 2,
      AGUARDANDO_APROVACAO: 3,
      PLANEJAMENTO: 4,
      EM_ANALISE: 5,
      NOVA: 6,
    };
    const prioridadeRank = {
      URGENTE: 0,
      CRITICA: 0,
      'CRÍTICA': 0,
      ALTA: 1,
      MEDIA: 2,
      'MÉDIA': 2,
      NORMAL: 3,
      BAIXA: 4,
    };

    const items = demandas.map((demanda) => {
      const detalhe = service.getById(Number(demanda.id)) || demanda;
      const solicitacoesAtivas = (detalhe.solicitacoes || [])
        .filter((item) => !SOLICITACAO_TERMINAL.has(normalizeStatus(item.status)));
      const ordensAtivas = (detalhe.ordens || [])
        .filter((item) => !OS_TERMINAL.has(normalizeStatus(item.status)));
      const solicitacao = solicitacoesAtivas[0] || null;
      const ordem = ordensAtivas[0] || null;
      const status = normalizeStatus(demanda.status);
      const prioridade = normalizeStatus(demanda.prioridade || 'NORMAL');
      const trabalhoRank = status === 'EM_ANDAMENTO'
        ? 0
        : solicitacoesAtivas.length > 0
          ? 1
          : (statusRank[status] ?? 8);

      return {
        id: Number(demanda.id),
        titulo: demanda.titulo || `Demanda #${demanda.id}`,
        equipamento_nome: demanda.equipamento_nome || null,
        categoria: demanda.categoria || null,
        prioridade,
        status,
        prazo_previsto: demanda.prazo_previsto || null,
        updated_at: demanda.updated_at || demanda.created_at || null,
        solicitacoes_ativas: solicitacoesAtivas.length,
        solicitacao_id: solicitacao ? Number(solicitacao.id) : null,
        solicitacao_numero: solicitacao?.numero || null,
        solicitacao_status: solicitacao ? normalizeStatus(solicitacao.status) : null,
        os_ativa_id: ordem ? Number(ordem.id) : null,
        os_ativa_status: ordem ? normalizeStatus(ordem.status) : null,
        _trabalho_rank: trabalhoRank,
        _prioridade_rank: prioridadeRank[prioridade] ?? 5,
      };
    })
      .sort((a, b) => {
        if (a._trabalho_rank !== b._trabalho_rank) return a._trabalho_rank - b._trabalho_rank;
        if (a._prioridade_rank !== b._prioridade_rank) return a._prioridade_rank - b._prioridade_rank;
        const updatedA = Date.parse(a.updated_at || '') || 0;
        const updatedB = Date.parse(b.updated_at || '') || 0;
        if (updatedA !== updatedB) return updatedB - updatedA;
        return b.id - a.id;
      })
      .slice(0, 5)
      .map(({ _trabalho_rank, _prioridade_rank, ...item }) => item);

    return res.json({ ok: true, limit: 5, items });
  } catch (error) {
    console.error('Demandas dashboard resumo error:', error);
    return res.status(500).json({ ok: false, items: [], error: 'Não foi possível carregar as demandas do painel.' });
  }
}

router.get('/', requireLogin, requireRole(ACCESS.demandas_view), ctrl.index);
router.get('/new', requireLogin, requireRole(ACCESS.demandas_open), ctrl.newForm);
router.get('/dashboard-resumo.json', requireLogin, requireRole(ACCESS.demandas_view), getDashboardResumo);
router.post('/', requireLogin, requireRole(ACCESS.demandas_open), ctrl.create);
router.get('/:id', requireLogin, requireRole(ACCESS.demandas_view), ctrl.show);
router.post('/:id/status', requireLogin, requireRole(ACCESS.demandas_manage), ctrl.updateStatus);
router.post('/:id/aprovacao', requireLogin, requireRole(ACCESS.demandas_approve), ctrl.updateApproval);
router.post('/:id/update', requireLogin, requireRole(ACCESS.demandas_manage), ctrl.addUpdate);
router.post('/:id/materiais', requireLogin, requireRole(ACCESS.demandas_materials), ctrl.addMaterials);
router.post('/:id/solicitacoes/:solicitacaoId/materiais', requireLogin, requireRole(ACCESS.demandas_materials), ctrl.appendMaterials);
router.post('/:id/convert-to-os', requireLogin, requireRole(ACCESS.demandas_convert), ctrl.convertToOS);

module.exports = router;
