const express = require("express");
const router = express.Router();
const { requireLogin, requireRole } = require("../auth/auth.middleware");
const { ACCESS } = require("../../config/rbac");
const ctrl = require("./pcm.controller");
const preventivasCtrl = require("../preventivas/preventivas.controller");
const ferramentalCtrl = require("../ferramental/ferramental.controller");
const correiasCtrl = require("../correias/correias.controller");

const PCM_ACCESS = ACCESS.pcm;
const PCM_MANAGE = ACCESS.pcm_manage;
const DIRETORIA_MANUTENCAO = ACCESS.diretoria_manutencao || [];
const DIRETORIA_MANUTENCAO_PATH = "/dashboard/diretoria/manutencao";

function redirectWithQuery(target) {
  return (req, res) => {
    const query = new URLSearchParams(req.query || {}).toString();
    return res.redirect(301, `${target}${query ? `?${query}` : ''}`);
  };
}

router.get("/", requireLogin, requireRole(PCM_ACCESS), ctrl.index);

router.get("/ferramental", requireLogin, requireRole(PCM_ACCESS), ferramentalCtrl.index);
router.post("/ferramental/equipes", requireLogin, requireRole(PCM_MANAGE), ferramentalCtrl.createTeam);
router.post("/ferramental/armarios", requireLogin, requireRole(PCM_MANAGE), ferramentalCtrl.createLocker);
router.post("/ferramental/ferramentas", requireLogin, requireRole(PCM_MANAGE), ferramentalCtrl.createTool);
router.post("/ferramental/custodias", requireLogin, requireRole(PCM_MANAGE), ferramentalCtrl.assignTool);
router.get("/ferramental/equipes/:equipeId/pdf", requireLogin, requireRole(PCM_ACCESS), ferramentalCtrl.teamPdf);
router.get("/ferramental/aceites/:aceiteId/evidencia/:tipo", requireLogin, requireRole(PCM_ACCESS), ferramentalCtrl.pcmEvidence);
router.post("/ferramental/aceites/:aceiteId/resolver", requireLogin, requireRole(PCM_MANAGE), ferramentalCtrl.resolveDivergence);
router.post("/ferramental/inventarios", requireLogin, requireRole(PCM_MANAGE), ferramentalCtrl.createInventory);
router.get("/ferramental/ferramentas/:ferramentaId/etiqueta-pdf", requireLogin, requireRole(PCM_ACCESS), ferramentalCtrl.toolLabelPdf);
router.get("/ferramental/ferramentas/:ferramentaId/historico", requireLogin, requireRole(PCM_ACCESS), ferramentalCtrl.toolHistory);
router.post("/ferramental/ferramentas/:ferramentaId/ocorrencias", requireLogin, requireRole(PCM_MANAGE), ferramentalCtrl.createPcmOccurrence);
router.post("/ferramental/ocorrencias/:ocorrenciaId/resolver", requireLogin, requireRole(PCM_MANAGE), ferramentalCtrl.resolveOccurrence);
router.post("/ferramental/inspecao-config", requireLogin, requireRole(PCM_MANAGE), ferramentalCtrl.configureInspection);
router.post("/ferramental/ferramentas/:ferramentaId/inspecao-config", requireLogin, requireRole(PCM_MANAGE), ferramentalCtrl.configureInspection);
router.post("/ferramental/inspecoes", requireLogin, requireRole(PCM_MANAGE), ferramentalCtrl.scheduleInspection);
router.post("/ferramental/ferramentas/:ferramentaId/inspecoes", requireLogin, requireRole(PCM_MANAGE), ferramentalCtrl.scheduleInspection);
router.get("/ferramental/inspecoes/:inspecaoId", requireLogin, requireRole(PCM_MANAGE), ferramentalCtrl.inspectionForm);
router.post("/ferramental/inspecoes/:inspecaoId/executar", requireLogin, requireRole(PCM_MANAGE), ferramentalCtrl.executeInspection);
router.post("/ferramental/inventarios-scan", requireLogin, requireRole(PCM_MANAGE), ferramentalCtrl.createScanInventory);
router.get("/ferramental/inventarios-scan/:sessaoId", requireLogin, requireRole(PCM_MANAGE), ferramentalCtrl.scanInventoryPage);
router.post("/ferramental/inventarios-scan/:sessaoId/scan", requireLogin, requireRole(PCM_MANAGE), ferramentalCtrl.scanInventoryToken);
router.post("/ferramental/inventarios-scan/:sessaoId/fechar", requireLogin, requireRole(PCM_MANAGE), ferramentalCtrl.closeScanInventory);

// Compatibilidade: o painel executivo saiu do PCM operacional e passou a ser
// parte do Painel da Diretoria. Favoritos antigos continuam funcionando.
router.get("/dashboard-gerencial", requireLogin, requireRole(DIRETORIA_MANUTENCAO), redirectWithQuery(DIRETORIA_MANUTENCAO_PATH));
router.get("/dashboard-gerencial/dados", requireLogin, requireRole(DIRETORIA_MANUTENCAO), redirectWithQuery(`${DIRETORIA_MANUTENCAO_PATH}/dados`));
router.get("/dashboard-gerencial/pdf", requireLogin, requireRole(DIRETORIA_MANUTENCAO), redirectWithQuery(`${DIRETORIA_MANUTENCAO_PATH}/pdf`));
router.get("/dashboard-gerencial/excel", requireLogin, requireRole(DIRETORIA_MANUTENCAO), redirectWithQuery(`${DIRETORIA_MANUTENCAO_PATH}/excel`));
router.get("/dashboard-gerencial/configurar", requireLogin, requireRole(DIRETORIA_MANUTENCAO), redirectWithQuery(DIRETORIA_MANUTENCAO_PATH));

router.get("/planejamento", requireLogin, requireRole(PCM_ACCESS), ctrl.planejamento);
router.get("/preventivas", requireLogin, requireRole(PCM_ACCESS), ctrl.preventivas);
router.get("/correias", requireLogin, requireRole(PCM_ACCESS), correiasCtrl.index);
router.post("/correias/planos", requireLogin, requireRole(PCM_MANAGE), correiasCtrl.create);
router.get("/preventivas/nova", requireLogin, requireRole(PCM_MANAGE), preventivasCtrl.newForm);
router.post("/preventivas", requireLogin, requireRole(PCM_MANAGE), preventivasCtrl.create);
router.get("/preventivas/eleger-mecanico", requireLogin, requireRole(PCM_MANAGE), preventivasCtrl.elegerMecanicoForm);
router.post("/preventivas/eleger-mecanico", requireLogin, requireRole(PCM_MANAGE), preventivasCtrl.salvarElegerMecanico);
router.get("/preventivas/programadas", requireLogin, requireRole(PCM_MANAGE), preventivasCtrl.programadasIndex);
router.post("/preventivas/programadas/gerar", requireLogin, requireRole(PCM_MANAGE), preventivasCtrl.gerarProgramadas);
router.post("/preventivas/programadas/lancar-os-segunda", requireLogin, requireRole(PCM_MANAGE), preventivasCtrl.gerarOSProgramadasSegunda);
router.post("/preventivas/programadas/lancar-os-lote-dia", requireLogin, requireRole(PCM_MANAGE), preventivasCtrl.lancarLoteDiarioPreventivas);
router.get("/planejamento/pdf", requireLogin, requireRole(PCM_ACCESS), ctrl.planejamentoPdf);
router.get("/falhas", requireLogin, requireRole(PCM_ACCESS), ctrl.falhas);
router.get("/engenharia", requireLogin, requireRole(PCM_ACCESS), ctrl.engenharia);
router.get("/lubrificacao", requireLogin, requireRole(PCM_ACCESS), ctrl.lubrificacao);
router.get("/lubrificacao/acompanhamento", requireLogin, requireRole(PCM_ACCESS), ctrl.lubrificacaoAcompanhamento);
router.get("/lubrificacao/pdf", requireLogin, requireRole(PCM_ACCESS), ctrl.lubrificacaoPdf);
router.get("/pecas-criticas", requireLogin, requireRole(PCM_ACCESS), ctrl.pecasCriticas);
router.get("/pecas-criticas/pdf", requireLogin, requireRole(PCM_ACCESS), ctrl.pecasCriticasPdf);
router.get("/programacao-semanal", requireLogin, requireRole(PCM_ACCESS), ctrl.programacaoSemanal);
router.get("/relatorios-avancados", requireLogin, requireRole(PCM_ACCESS), ctrl.relatoriosAvancados);
router.get("/relatorios-avancados/pdf", requireLogin, requireRole(PCM_ACCESS), ctrl.relatoriosAvancadosPdf);
router.get("/relatorios-avancados/excel", requireLogin, requireRole(PCM_ACCESS), ctrl.relatoriosAvancadosExcel);

// Compatibilidade de URLs antigas: as telas duplicadas foram consolidadas,
// mas favoritos e links históricos continuam chegando ao destino correto.
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
router.post("/lubrificacao/semana/responsavel", requireLogin, requireRole(PCM_MANAGE), ctrl.salvarResponsavelSemanaLubrificacao);
router.post("/lubrificacao/semana/gerar-os-hoje", requireLogin, requireRole(PCM_MANAGE), ctrl.gerarOSLubrificacaoHoje);
router.post("/lubrificacao/gerar-roteiro-base", requireLogin, requireRole(PCM_MANAGE), ctrl.gerarRoteiroBaseLubrificacao);
router.post("/lubrificacao/:id/validar", requireLogin, requireRole(PCM_MANAGE), ctrl.validarLubrificacao);
router.post("/lubrificacao/:id/distribuir", requireLogin, requireRole(PCM_MANAGE), ctrl.distribuirLubrificacao);
router.post("/lubrificacao/sugerir-ia", requireLogin, requireRole(PCM_MANAGE), ctrl.sugerirPlanoLubrificacaoIA);
router.post("/lubrificacao/aplicar-sugestao-ia", requireLogin, requireRole(PCM_MANAGE), ctrl.aplicarSugestaoLubrificacaoIA);
router.post("/programacao-semanal/salvar", requireLogin, requireRole(PCM_MANAGE), ctrl.salvarProgramacao);
router.post("/programacao-semanal/:id/programar", requireLogin, requireRole(PCM_MANAGE), ctrl.programarBacklog);
router.post("/backlog/:id/programar", requireLogin, requireRole(PCM_MANAGE), ctrl.programarBacklog);

router.post("/planos", requireLogin, requireRole(PCM_MANAGE), ctrl.createPlano);
router.post("/planos/:id/gerar-os", requireLogin, requireRole(PCM_MANAGE), ctrl.gerarOS);
router.post("/planos/:id/registrar-execucao", requireLogin, requireRole(PCM_MANAGE), ctrl.registrarExecucao);

module.exports = router;
