const express = require("express");
const router = express.Router();
const { requireLogin, requireRole } = require("../auth/auth.middleware");
const { ACCESS } = require("../../config/rbac");
const ctrl = require("./pcm.controller");

const PCM_ACCESS = ACCESS.pcm;

router.get("/", requireLogin, requireRole(PCM_ACCESS), ctrl.index);
router.get("/planejamento", requireLogin, requireRole(PCM_ACCESS), ctrl.planejamento);
router.get("/falhas", requireLogin, requireRole(PCM_ACCESS), ctrl.falhas);
router.get("/engenharia", requireLogin, requireRole(PCM_ACCESS), ctrl.engenharia);
router.get("/criticidade", requireLogin, requireRole(PCM_ACCESS), ctrl.criticidade);
router.post("/criticidade", requireLogin, requireRole(PCM_ACCESS), ctrl.salvarCriticidade);
router.get("/lubrificacao", requireLogin, requireRole(PCM_ACCESS), ctrl.lubrificacao);
router.get("/pecas-criticas", requireLogin, requireRole(PCM_ACCESS), ctrl.pecasCriticas);
router.get("/programacao-semanal", requireLogin, requireRole(PCM_ACCESS), ctrl.programacaoSemanal);
router.get("/backlog", requireLogin, requireRole(PCM_ACCESS), ctrl.backlog);
router.get("/rotas-inspecao", requireLogin, requireRole(PCM_ACCESS), ctrl.rotasInspecao);
router.get("/relatorios-avancados", requireLogin, requireRole(PCM_ACCESS), ctrl.relatoriosAvancados);


router.post("/atualizar-indicadores", requireLogin, requireRole(PCM_ACCESS), ctrl.atualizarIndicadores);
router.post("/falhas/registrar", requireLogin, requireRole(PCM_ACCESS), ctrl.registrarFalha);
router.post("/engenharia/componentes", requireLogin, requireRole(PCM_ACCESS), ctrl.adicionarComponente);
router.post("/lubrificacao/pontos", requireLogin, requireRole(PCM_ACCESS), ctrl.adicionarLubrificacao);
router.post("/programacao-semanal/salvar", requireLogin, requireRole(PCM_ACCESS), ctrl.salvarProgramacao);
router.post("/backlog/:id/programar", requireLogin, requireRole(PCM_ACCESS), ctrl.programarBacklog);
router.post("/rotas-inspecao/nova", requireLogin, requireRole(PCM_ACCESS), ctrl.novaRota);
router.post("/rotas-inspecao/salvar-execucao", requireLogin, requireRole(PCM_ACCESS), ctrl.salvarExecucaoRota);

router.post("/planos", requireLogin, requireRole(PCM_ACCESS), ctrl.createPlano);
router.post("/planos/:id/gerar-os", requireLogin, requireRole(PCM_ACCESS), ctrl.gerarOS);
router.post("/planos/:id/registrar-execucao", requireLogin, requireRole(PCM_ACCESS), ctrl.registrarExecucao);

module.exports = router;
