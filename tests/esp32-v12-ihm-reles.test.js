'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../firmware/releases/CampoDoGado_ESP32_V12_Bancada_Reles.ino'),'utf8');
const script=[...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
function panel(){
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',dataset:{},disabled:true,setAttribute(){},addEventListener(){}});return nodes.get(id);};
 const channels=['vermelho','amarelo','verde','camisa','eixo','carga_aberta','descarga_aberta'];
 const buttons=channels.map(channel=>({...node(channel),dataset:{benchTest:channel}}));
 const stops=[node('closeLoad'),node('closeDischarge')];
 const window={};
 vm.runInNewContext(script,{window,document:{getElementById:node,querySelectorAll:selector=>selector==='[data-bench-test]'?buttons:stops}});
 return {update:window.cgdGatePanelUpdate,node,buttons,stops};
}
function idle(){return {modo:'parado',digestor:1,bancada_reles:{compatibilidade_pinos:true,autorizacao_local:true,chave_local_ativa:false,chave_local_obrigatoria:false,bloqueada:true}};}
test('IHM libera os sete testes locais sem CAD ou jumper e desabilita sem contato',()=>{
 const p=panel();p.update(idle());assert.ok(p.buttons.every(button=>!button.disabled));
 assert.match(p.node('cg-key').textContent,/OPCIONAL/);
 p.update(null);assert.ok(p.buttons.every(button=>button.disabled));assert.ok(p.stops.every(button=>button.disabled));
 assert.equal(p.node('cg-key').textContent,'SEM CONTATO');
});
test('IHM mostra relé de teste local mesmo com modo parado; não inventa movimento mecânico',()=>{
 const p=panel(),state=idle();Object.assign(state.bancada_reles,{teste_individual:true,teste_canal:5,teste_restante_ms:1200,carga_aberta:true});p.update(state);
 assert.ok(p.buttons.every(button=>button.disabled));assert.equal(p.node('cg-led-carga').dataset.on,'true');
 assert.equal(p.node('cg-visual-carga').dataset.virtual,'fechada');assert.match(p.node('benchStatus').textContent,/carga aberta/);
});
test('IHM bloqueia placa incompatível, chave obrigatória aberta e modo PT100',()=>{
 const p=panel();let state=idle();state.bancada_reles.compatibilidade_pinos=false;p.update(state);assert.ok(p.buttons.every(button=>button.disabled));
 state=idle();state.bancada_reles.autorizacao_local=false;state.bancada_reles.chave_local_obrigatoria=true;p.update(state);assert.ok(p.buttons.every(button=>button.disabled));
 state=idle();state.modo='real';p.update(state);assert.ok(p.buttons.every(button=>button.disabled));
});
