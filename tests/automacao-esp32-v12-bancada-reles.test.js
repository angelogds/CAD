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
 assert.match(firmware,/temperatura-v12-bancada-reles-leds-r2/);
 assert.match(firmware,/if\(s\.mode!=REMOTO_BANCADA\|\|!s\.bench\.mirroring\)\{/);
 assert.match(firmware,/published\.signal=cgd::unavailable\(cgd::SensorStatus::SEM_SINAL\)/);
 assert.match(firmware,/preencherSinal\(doc,published\)/);
 assert.match(firmware,/#define CGD_ENABLE_PURGE_OUTPUTS 1/);
 assert.match(firmware,/#define CGD_ENABLE_MATERIAL_GATE_OUTPUTS 1/);
 assert.match(firmware,/void apply\(bool allow,bool loadOpen,bool loadClosed,bool dischargeOpen,bool dischargeClosed\)/);
 assert.match(firmware,/\(loadOpen&&loadClosed\)/);
 assert.match(firmware,/\(dischargeOpen&&dischargeClosed\)/);
 assert.match(firmware,/purgeOutputs\.applyBench\(benchActive,next\.bench\.outputs\[3\],next\.bench\.outputs\[4\]\)/);
});
test('espelhamento automático depende de seleção CAD, chave local e pacote completo atual, nunca salvo',()=>{
 assert.match(firmware,/benchLeds\.selectCad\(millis\(\)\)/);
 assert.match(firmware,/i\.cadMode&&i\.wifi&&i\.packet&&i\.complete&&i\.key&&i\.compatible/);
 assert.match(firmware,/void bancadaRelesHandler\(\)/);
 assert.match(firmware,/\/api\/bancada\/reles/);
 assert.match(firmware,/MAX_VALIDITY_MS=6500U/);
 assert.doesNotMatch(firmware,/preferencias(?:CAD|Purga)?\.put(?:Bool|UInt|String)\([^\n]*bench/);
 assert.match(firmware,/modo=PARADO;benchLeds\.stop\(\)/);
 assert.match(firmware,/remoteCommand\.completeState = visualValid/);
});
test('transição de modo, perda de comunicação e falha desligam saídas',()=>{
 assert.match(firmware,/if\(modo!=REMOTO_BANCADA\)benchLeds\.stop\(\);purgeOutputs\.stopAll\(\);cgdGate\.stop\(\)/);
 assert.match(firmware,/sync.*fault|synchronizationFault = true/i);
 assert.match(firmware,/if\(!configured\(\)\|\|!allow\|\|!keyOn\(\)/);
 assert.match(firmware,/const bool ok=false; \/\/ Proibe pulso local de cilindros/);
 assert.match(firmware,/if\(!next\.bench\.mirroring\)\{next\.signal\.color=cgd::Color::DESLIGADO;next\.signal\.ready=false;/);
 assert.match(firmware,/todos os demais modos sao apenas pre-visualizacao, sem GPIO\.[\s\S]*?pins=\{false,false,false\};next\.signal\.color=cgd::Color::DESLIGADO;next\.signal\.ready=false/);
 assert.match(firmware,/purgeOutputs\.stop\(i\); \/\/ V12: temporizador fora do CAD e somente virtual/);
 assert.match(firmware,/defined\(BOARD_HAS_PSRAM\)/);
 assert.match(firmware,/benchPinsCompatible=!psramFound\(\)/);
 assert.match(firmware,/configured\(\)const\{return CGD_ENABLE_MATERIAL_GATE_OUTPUTS==1&&benchPinsCompatible/);
});
test('IHM usa os dois blocos de purgadores e so um de guilhotinas',()=>{
 assert.equal((firmware.match(/id="cgdgate"/g)||[]).length,1);
 assert.equal((firmware.match(/id="p1mode"/g)||[]).length,1);
 assert.equal((firmware.match(/id="p2mode"/g)||[]).length,1);
 assert.ok(firmware.indexOf('id="purgeSettings"')<firmware.indexOf('id="cgdgate"'));
 assert.ok(firmware.indexOf('id="cgdgate"')<firmware.indexOf('id="wifiSettings"'));
 assert.match(firmware,/id="p1led"/);assert.match(firmware,/id="p2led"/);
 assert.doesNotMatch(firmware,/id="benchArm"/);assert.match(firmware,/id="benchStop"/);
 assert.match(firmware,/id="cg-time-carga"/);assert.match(firmware,/id="cg-time-descarga"/);
 assert.doesNotMatch(firmware,/id="cg-pusher-camisa"/);
 assert.doesNotMatch(firmware,/id="cg-pusher-eixo"/);
 assert.equal((firmware.match(/data-bench-test="(?:verde|amarelo|vermelho|camisa|eixo|carga_aberta|carga_fechada|descarga_aberta|descarga_fechada)"/g)||[]).length,9);
 const vm=require('node:vm');
 for(const script of firmware.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
});
test('maquete 3D fica sem nomes flutuantes mas com indicador superior',()=>{
 assert.match(scene,/if \(!makeLabel\) return;/);
 const css=read('public/css/automacao-digestores-circuito.css');
 assert.match(css,/auto-scene-labels\{display:none !important/);
 assert.match(scene,/const led=mesh\(gate,new THREE\.SphereGeometry/);
 assert.match(scene,/gate\.led\.material\.emissiveIntensity=lit\?1\.8:0/);
 assert.match(view,/circuito-upper-gate-led/);
});
