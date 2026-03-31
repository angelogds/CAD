const express = require("express");
const { requireLogin } = require("../auth/auth.middleware");
const ctrl = require("./ia.controller");

const router = express.Router();

router.post("/transcricao/os", requireLogin, ctrl.transcreverAudioOS);
router.post("/transcricao/fechamento", requireLogin, ctrl.transcreverAudioFechamento);
router.post("/fechamento/resumo", requireLogin, ctrl.gerarResumoTecnicoFechamento);
router.post("/fechamento/fotos", requireLogin, ctrl.analisarFotosFechamento);
router.get("/historico/semelhante", requireLogin, ctrl.buscarHistoricoSemelhante);
router.post("/acoes-inteligentes", requireLogin, ctrl.gerarAcoesInteligentes);

module.exports = router;
