const express = require("express");
const router = express.Router();
const { requireLogin, requireRole } = require("../auth/auth.middleware");
const { ACCESS } = require("../../config/rbac");
const ctrl = require("./pcm.controller");

const PCM_ACCESS = ACCESS.pcm;
const PCM_MANAGE = ACCESS.pcm_manage;

router.get("/", requireLogin, requireRole(PCM_ACCESS), ctrl.index);
router.get("/dashboard-gerencial", requireLogin, requireRole(PCM_ACCESS), ctrl.dashboardGerencial);
router.get("/dashboard-gerencial/dados", requireLogin, requireRole(PCM_ACCESS), ctrl.dashboardDados);
router.get("/dashboard-gerencial/pdf", requireLogin, requireRole(PCM_ACCESS), ctrl.dashboardPdf);
router.get("/dashboard-gerencial/excel", requireLogin, requireRole(PCM_ACCESS), ctrl.dashboardExcel);
router.get("/planejamento", requireLogin, requireRole(PCM_ACCESS), ctrl.planejamento);
router.get("/planejamento/pdf", requireLogin, requireRole(PCM_ACCESS), ctrl.planejamentoPdf);
router.get("/falhas", requireLogin, requireRole(PCM_ACCESS), ctrl.falhas);
router.get("/engenharia", requireLogin, requireRole(PCM_ACCESS), ctrl.engenharia);
router.get("/lubrificacao", requireLogin, requireRole(PCM_ACCESS), ctrl.lubrificacao);
router.get("/pecas-criticas", requireLogin, requireRole(PCM_ACCESS), ctrl.pecasCriticas);
router.get("/pecas-criticas/pdf", requireLogin, requireRole(PCM_ACCESS), ctrl.pecasCriticasPdf);
router.get("/programacao-semanal", requireLogin, requireRole(PCM_ACCESS), ctrl.programacaoSemanal);
router.get("/relatorios-avancados", requireLogin, requireRole(PCM_ACCESS), ctrl.relatoriosAvancados);
router.get("/relatorios-avancados/pdf", requireLogin, requireRole(PCM_ACCESS), ctrl.relatoriosAvancadosPdf);
router.get("/relatorios-avancados/excel", requireLogin, requireRole(PCM_ACCESS), ctrl.relatoriosAvancadosExcel);

// Compatibilidade de URLs antigas: as telas duplicadas foram consolidadas,
// mas favoritos e links históricos continuam chegando ao destino correto.
router.get("/dashboard-gerencial/configurar", requireLogin, requireRole(PCM_ACCESS), (_req, res) => res.redirect(301, "/pcm/dashboard-gerencial"));
router.get("/backlog", requireLogin, requireRole(PCM_ACCESS), (_req, res) => res.redirect(301, "/pcm/programacao-semanal"));
router.get("/rotas-inspecao", requireLogin, requireRole(PCM_ACCESS), (_req, res) => res.redirect(301, "/inspecao"));
router.get("/criticidade", requireLogin, requireRole(PCM_ACCESS), (req, res) => {
  const equipamento = req.query.equipamento_id ? `?equipamento_id=${encodeURIComponent(req.query.equipamento_id)}` : "";
  return res.redirect(301, `/pcm/engenharia${equipamento}#criticidade`);
});


router.post("/atualizar-indicadores", requireLogin, requireRole(PCM_MANAGE), ctrl.atualizarIndicadores);
router.post("/executar-automacao", requireLogin, requireRole(PCM_MANAGE), ctrl.executarAutomacao);
router.post("/analisar-ia", requireLogin, requireRole(PCM_MANAGE), ctrl.analisarIA);
router.post("/falhas/registrar", requireLogin, requireRole(PCM_MANAGE), ctrl.registrarFalha);
router.post("/falhas/:osId/classificar", requireLogin, requireRole(PCM_MANAGE), ctrl.classificarFalha);
router.post("/engenharia/componentes", requireLogin, requireRole(PCM_MANAGE), ctrl.adicionarComponente);
router.post("/engenharia/criticidade", requireLogin, requireRole(PCM_MANAGE), ctrl.salvarCriticidade);
router.post("/lubrificacao/pontos", requireLogin, requireRole(PCM_MANAGE), ctrl.adicionarLubrificacao);
router.post("/lubrificacao/sugerir-ia", requireLogin, requireRole(PCM_MANAGE), ctrl.sugerirPlanoLubrificacaoIA);
router.post("/lubrificacao/aplicar-sugestao-ia", requireLogin, requireRole(PCM_MANAGE), ctrl.aplicarSugestaoLubrificacaoIA);
router.post("/programacao-semanal/salvar", requireLogin, requireRole(PCM_MANAGE), ctrl.salvarProgramacao);
router.post("/programacao-semanal/:id/programar", requireLogin, requireRole(PCM_MANAGE), ctrl.programarBacklog);
router.post("/backlog/:id/programar", requireLogin, requireRole(PCM_MANAGE), ctrl.programarBacklog);

router.post("/planos", requireLogin, requireRole(PCM_MANAGE), ctrl.createPlano);
router.post("/planos/:id/gerar-os", requireLogin, requireRole(PCM_MANAGE), ctrl.gerarOS);
router.post("/planos/:id/registrar-execucao", requireLogin, requireRole(PCM_MANAGE), ctrl.registrarExecucao);

module.exports = router;
