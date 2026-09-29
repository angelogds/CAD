const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ejs=require('ejs');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('PCM concentra gestão de preventivas',()=>{
 const routes=read('modules/pcm/pcm.routes.js');
 assert.match(routes,/\/preventivas".*ctrl\.preventivas/);
 assert.match(routes,/\/preventivas\/nova/);
 assert.match(routes,/PCM_MANAGE.*preventivasCtrl\.create/s);
 const nav=read('views/pcm/partials/internal-nav.ejs');
 assert.match(nav,/href="\/pcm\/preventivas"/);
 const view=read('views/pcm/preventivas.ejs');
 assert.doesNotThrow(()=>ejs.compile(view,{filename:path.join(root,'views/pcm/preventivas.ejs')}));
 assert.match(view,/Gestão de manutenção preventiva/);
 assert.match(view,/Responsáveis das preventivas/);
});

test('módulo Preventivas fica operacional e sem criação administrativa',()=>{
 const view=read('views/preventivas/index.ejs');
 assert.doesNotThrow(()=>ejs.compile(view,{filename:path.join(root,'views/preventivas/index.ejs')}));
 assert.match(view,/Minhas Preventivas/);
 assert.match(view,/Responsável/);
 assert.match(view,/pv-task-grid/);
 assert.doesNotMatch(view,/Novo plano|Eleger mecânico|Lançar lote/);
});

test('RBAC separa gestão PCM de execução mecânica',()=>{
 const rbac=read('config/rbac.js');
 assert.match(rbac,/preventivas_manage:\s*\[ROLE\.ADMIN, ROLE\.PCM, ROLE\.MANUTENCAO_SUPERVISOR\]/);
 assert.match(rbac,/preventivas_execute:\s*\[ROLE\.ADMIN, ROLE\.MECANICO, ROLE\.MANUTENCAO_SUPERVISOR\]/);
 const routes=read('modules/preventivas/preventivas.routes.js');
 assert.match(routes,/execUpdateStatus[\s\S]*?preventivas_execute|preventivas_execute[\s\S]*?execUpdateStatus/);
});

test('baixa preventiva valida responsável atribuído',()=>{
 const service=read('modules/preventivas/preventivas.service.js');
 const controller=read('modules/preventivas/preventivas.controller.js');
 assert.match(service,/function userCanExecutePreventiva/);
 assert.match(service,/responsavel_1_id/);
 assert.match(service,/responsavel_2_id/);
 assert.match(controller,/userCanExecutePreventiva\(execId/);
});

test('gestão não cria nova estrutura de banco',()=>{
 const tree=['modules/preventivas/preventivas.service.js','modules/pcm/pcm.controller.js','modules/pcm/pcm.routes.js','views/pcm/preventivas.ejs'].map(read).join('\n');
 assert.doesNotMatch(tree,/CREATE TABLE.*preventiva_pcm/i);
 assert.match(tree,/preventiva_execucoes/);
});
