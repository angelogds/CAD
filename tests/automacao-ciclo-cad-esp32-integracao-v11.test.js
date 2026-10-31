const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../public/js/automacao-digestores-circuito-core');
const { normalizeSimulationState, readStoredState } = require('../modules/automacao/estado-simulacao');

const file = name => fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const payload = (changes={}) => ({
 aquecimento_simulado:true,
 purgadores_simulados:{camisa:'FECHADO',eixo:'FECHADO'},
 purgadores_visuais:{camisa:'ABERTO',eixo:'FECHADO'},
 guilhotinas_simuladas:{carga:'ABERTA',descarga:'FECHADA'},
 etapa_mecanica:'CARGA', ...changes
});

test('simulacao visual dos purgadores e independente dos comandos fisicos',()=>{
 const accepted=normalizeSimulationState(payload());
 assert.equal(accepted.purgadores_simulados.camisa,'FECHADO');
 assert.equal(accepted.purgadores_visuais.camisa,'ABERTO');
 assert.equal(accepted.guilhotinas_simuladas.carga,'ABERTA');
 const stored=readStoredState(JSON.stringify({...accepted,fonte_simulacao:'CAD'}));
 assert.equal(stored.etapa_mecanica,'CARGA');
 assert.equal(stored.fonte_simulacao,'CAD');
 assert.equal(stored.estado_simulacao_disponivel,true);
});
test('protocolo rejeita guilhotinas e etapas invalidas',()=>{
 for (const bad of [
  payload({guilhotinas_simuladas:{carga:'ABRIR',descarga:'FECHADA'}}),
  payload({guilhotinas_simuladas:{carga:'ABERTA',descarga:'INVALIDA'}}),
  payload({purgadores_visuais:{camisa:'ABRIR',eixo:'FECHADO'}}),
  payload({etapa_mecanica:'ACIONAR_RELE'}),
 ]) assert.throws(()=>normalizeSimulationState(bad),{status:400});
});
test('compatibilidade com pacotes anteriores preserva portao virtual fechado',()=>{
 const state=normalizeSimulationState({aquecimento_simulado:false,purgadores_simulados:{camisa:'FECHADO',eixo:'FECHADO'}});
 assert.equal(Object.hasOwn(state,'guilhotinas_simuladas'),false,'pacotes antigos permanecem idênticos');
 assert.equal(Object.hasOwn(state,'etapa_mecanica'),false);
});
test('etapas carga, cozimento, descarga, transferencia e retomada sem ultrapassar 120C',()=>{
 const state=Core.createState();
 Core.startLinkedDemo(state,'D1');
 Core.tick(state,6);
 assert.equal(state.stage,'COZIMENTO');
 Core.pause(state); assert.equal(state.paused,true);
 Core.resume(state); assert.equal(state.running,true);
 Core.tick(state,15,[{tempC:120,ready:true}]);
 assert.equal(state.stage,'COZIMENTO');
 Core.tick(state,1,[{tempC:121,ready:true}]);
 assert.equal(state.stage,'DESCARGA');
 assert.equal(state.dischargeGates[0],true);
 Core.tick(state,Core.EXAMPLE.dischargeSeconds);
 assert.equal(state.stage,'TRANSFERENCIA');
 assert.equal(state.dischargeGates[0],false);
 Core.tick(state,Core.EXAMPLE.transferSeconds);
 assert.equal(state.stage,'CONCLUIDO');
 assert.equal(state.transferredLiters,Core.EXAMPLE.chargeLiters*Core.EXAMPLE.liquidFraction);
});
test('botao integra automaticamente e aparece acima da maquete mecanica',()=>{
 const view=file('views/automacao/simulador-digestores.ejs');
 const js=file('public/js/automacao-simulador.js');
 const remote=file('public/js/automacao-simulador-remoto.js');
 assert.ok(view.indexOf('id="sim-link-circuits"')>0);
 assert.ok(view.indexOf('id="sim-link-circuits"')<view.indexOf("include('partials/digestores-circuito'"));
 assert.match(js,/let integrationOn = Boolean\(integrationButton\)/);
 assert.match(remote,/purgadores_visuais:\{camisa:camisaVisual,eixo:eixoVisual\}/);
 assert.match(remote,/guilhotinas_simuladas:\{carga,descarga\}/);
});
test('firmware conserva comando mecanico somente visual e desabilita GPIO por padrao',()=>{
 const ino=file('firmware/releases/CampoDoGado_ESP32_V10_Guilhotinas.ino');
 assert.match(ino,/#define CGD_ENABLE_MATERIAL_GATE_OUTPUTS 0/);
 assert.match(ino,/remoteCommand\.gateVisualOpen\[0\]/);
 assert.match(ino,/doc\["guilhotinas_simuladas"\]/);
 assert.match(ino,/data\?\.guilhotinas_simuladas/);
 assert.match(ino,/data\.purgadores_visuais\|\|data\.purgadores_simulados/);
 assert.match(ino,/document\.querySelectorAll\('#cgdgate \[data-cg-real\]'\)/);
});
