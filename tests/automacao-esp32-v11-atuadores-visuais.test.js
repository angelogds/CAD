const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {normalizeSimulationState}=require('../modules/automacao/estado-simulacao');
const Core=require('../public/js/automacao-digestores-circuito-core');
const contents=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function mock(extra={}) {
 return {aquecimento_simulado:true,purgadores_simulados:{camisa:'FECHADO',eixo:'FECHADO'},
  purgadores_visuais:{camisa:'ABERTO',eixo:'FECHADO'},
  guilhotinas_simuladas:{carga:'ABERTA',descarga:'FECHADA'},
  empurradores_simulados:{camisa:'ABERTO',eixo:'FECHADO'},
  motor_digestor_simulado:true,etapa_mecanica:'COZIMENTO',...extra};
}
test('protocolo V11 aceita atuadores e motor APENAS virtuais',()=>{
 const result=normalizeSimulationState(mock());
 assert.deepEqual(result.empurradores_simulados,{camisa:'ABERTO',eixo:'FECHADO'});
 assert.equal(result.motor_digestor_simulado,true);
 assert.equal(result.purgadores_simulados.camisa,'FECHADO','campo industrial continua FECHADO');
 assert.equal(result.guilhotinas_simuladas.carga,'ABERTA');
});
test('rejeita motor ou empurrador invalidos com 400',()=>{
 for(const obj of [
  mock({motor_digestor_simulado:'LIGADO'}),
  mock({empurradores_simulados:{camisa:'ABRIR',eixo:'FECHADO'}}),
  mock({empurradores_simulados:null}),
  mock({guilhotinas_simuladas:{carga:'ABERTA',descarga:'ABRIR'}}),
 ]) assert.throws(()=>normalizeSimulationState(obj),{status:400});
});
test('pacote V10 sem campos V11 continua valido',()=>{
 const p=mock();delete p.motor_digestor_simulado;delete p.empurradores_simulados;
 const r=normalizeSimulationState(p);
 assert.equal(Object.hasOwn(r,'motor_digestor_simulado'),false);
 assert.equal(Object.hasOwn(r,'empurradores_simulados'),false);
});
test('circuito integrado: carga, motor em cozimento, guilhotina descarga e fechamento',()=>{
 const state=Core.createState();
 assert.deepEqual(Core.startLinkedDemo(state,'D1'),{ok:true});
 assert.equal(state.gates[0],true);
 assert.equal(state.digestors[0].shaft,false);
 Core.tick(state,Core.EXAMPLE.loadSeconds);
 assert.equal(state.stage,'COZIMENTO');
 assert.equal(state.gates[0],false);
 assert.equal(state.digestors[0].shaft,true);
 assert.equal(state.dischargeGates[0],false);
 Core.tick(state,1,[{tempC:120,ready:true}]);
 assert.equal(state.stage,'COZIMENTO');
 Core.tick(state,1,[{tempC:121,ready:true}]);
 assert.equal(state.stage,'DESCARGA');
 assert.equal(state.digestors[0].shaft,false);
 assert.equal(state.dischargeGates[0],true);
 Core.tick(state,Core.EXAMPLE.dischargeSeconds);
 assert.equal(state.dischargeGates[0],false);
});
test('CAD separa comandar relé de espelhar motor, empurradores e guilhotinas',()=>{
 const r=contents('public/js/automacao-simulador-remoto.js');
 assert.match(r,/empurradores_simulados:empurradores/);
 assert.match(r,/motor_digestor_simulado:isCooking/);
 assert.match(r,/purgadores_simulados:\{camisa,eixo\}/);
 const cad=contents('views/automacao/simulador-digestores.ejs');
 assert.match(cad,/id="sim-link-circuits"[^>]*aria-pressed="true"/);
 assert.match(cad,/Ciclo integrado/);
 assert.match(cad,/motor-virtual/);
});
test('ESP32 V11 nunca usa o espelho CAD para movimentar saidas fisicas',()=>{
 const firmware=contents('firmware/releases/CampoDoGado_ESP32_V11_Simulacao_Integrada.ino');
 assert.match(firmware,/temperatura-v11-simulacao-atuadores-visuais/);
 assert.match(firmware,/#define CGD_ENABLE_MATERIAL_GATE_OUTPUTS 0/);
 assert.match(firmware,/doc\["empurradores_simulados"\]/);
 assert.match(firmware,/doc\["motor_digestor_simulado"\]/);
 assert.match(firmware,/motorVirtual\.is<bool>\(\)/);
 assert.match(firmware,/cadPurgeTest\.update\(false/);
 assert.match(firmware,/if \(modo == REMOTO_BANCADA\) \{\s*purgadores\[i\]\.stop\(\)/);
 assert.doesNotMatch(firmware,/cadPurgeTest\.update\(true/);
});
