'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const firmware=read('firmware/releases/CampoDoGado_ESP32_V12_Bancada_Reles.ino');
const scene=read('public/js/automacao-digestores-scene.mjs');
const view=read('views/automacao/partials/digestores-circuito.ejs');

test('V12 preserva V11 sem modificar firmware de producao e liga LED bancada separado',()=>{
 assert.match(firmware,/temperatura-v12-bancada-reles-leds/);
 assert.match(firmware,/#define CGD_ENABLE_PURGE_OUTPUTS 1/);
 assert.match(firmware,/#define CGD_ENABLE_MATERIAL_GATE_OUTPUTS 1/);
 assert.match(firmware,/void benchSet\(bool allow,bool loadOpen,bool dischargeOpen\)/);
 assert.match(firmware,/digitalWrite\(p\[loadOpen\?0:1\],CGD_GATE_RELAY_ACTIVE_LEVEL\)/);
 assert.match(firmware,/digitalWrite\(p\[dischargeOpen\?2:3\],CGD_GATE_RELAY_ACTIVE_LEVEL\)/);
 assert.match(firmware,/purgeOutputs\.apply\(i,next\.pusherDisplayOpen\[i\],true\)/);
});
test('armamento dos relés depende de chave local e simulação CAD atual, nunca salvo',()=>{
 assert.match(firmware,/bool benchRelaysArmed=false/);
 assert.match(firmware,/modo==REMOTO_BANCADA&&WiFi\.status\(\)==WL_CONNECTED/);
 assert.match(firmware,/cgdGate\.keyOn\(\)&&fresh/);
 assert.match(firmware,/void bancadaRelesHandler\(\)/);
 assert.match(firmware,/\/api\/bancada\/reles/);
 assert.match(firmware,/BENCH_MAX_ARM_MS=600000U/);
 assert.doesNotMatch(firmware,/preferencias(?:CAD|Purga)?\.put(?:Bool|UInt|String)\([^\n]*benchRelaysArmed/);
 assert.match(firmware,/if\(benchRelaysArmed&&!benchHealthy\)/);
});
test('transição de modo, perda de comunicação e falha desligam saídas',()=>{
 assert.match(firmware,/previousMode!=modo\)\{benchRelaysArmed=false;purgeOutputs\.stopAll\(\);cgdGate\.stop\(\)/);
 assert.match(firmware,/sync.*fault|synchronizationFault = true/i);
 assert.match(firmware,/if\(!configured\(\)\|\|!allow\|\|!keyOn\(\)\)\{stop\(\);return;\}/);
 assert.match(firmware,/const bool ok=false; \/\/ Proibe pulso local de cilindros/);
});
test('IHM usa os dois blocos de purgadores e so um de guilhotinas',()=>{
 assert.equal((firmware.match(/id="cgdgate"/g)||[]).length,1);
 assert.equal((firmware.match(/id="p1mode"/g)||[]).length,1);
 assert.equal((firmware.match(/id="p2mode"/g)||[]).length,1);
 assert.ok(firmware.indexOf('id="purgeSettings"')<firmware.indexOf('id="cgdgate"'));
 assert.ok(firmware.indexOf('id="cgdgate"')<firmware.indexOf('id="wifiSettings"'));
 assert.match(firmware,/id="p1led"/);assert.match(firmware,/id="p2led"/);
 assert.match(firmware,/id="benchArm"/);assert.match(firmware,/id="benchStop"/);
 assert.match(firmware,/id="cg-time-carga"/);assert.match(firmware,/id="cg-time-descarga"/);
 assert.doesNotMatch(firmware,/id="cg-pusher-camisa"/);
 assert.doesNotMatch(firmware,/id="cg-pusher-eixo"/);
});
test('maquete 3D fica sem nomes flutuantes mas com indicador superior',()=>{
 assert.match(scene,/showFloatingEquipmentNames = false/);
 assert.match(scene,/const led=mesh\(gate,new THREE\.SphereGeometry/);
 assert.match(scene,/gate\.led\.material\.emissiveIntensity=lit\?1\.8:0/);
 assert.match(view,/circuito-upper-gate-led/);
});
