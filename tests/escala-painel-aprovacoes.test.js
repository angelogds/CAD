const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const Database=require('better-sqlite3');
const ejs=require('ejs');
const root=path.resolve(__dirname,'..');
function load(relative,overrides={}) {
 const filename=path.join(root,relative),realRequire=createRequire(filename),module={exports:{}};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,require:n=>Object.hasOwn(overrides,n)?overrides[n]:realRequire(n),console,__dirname:path.dirname(filename)});
 return module.exports;
}
function response() {return {locals:{},statusCode:200,render(view,data){this.view=view;this.data=data;return this;},redirect(url){this.url=url;return this;},status(code){this.statusCode=code;return this;},send(){return this;}};}
function controllerFixture() {
 const calls=[];
 const service={listarPainelEscala:()=>({pendentes:0,colaboradores:[]}),buscarColaboradorDoUsuario:()=>({id:5}),listarColaboradoresManutencao:()=>[],canIniciarHoraExtraDesde17:()=>false};
 const solicitacoes={listarPendentesParaAprovacao:opts=>{calls.push(['listar',opts]);return [{id:7}];},contarPendentes:()=>{calls.push(['contar']);return 9;}};
 return {controller:load('modules/escala/escala.controller.js',{'./escala.service':service,'./escala.folga-solicitacao.service':solicitacoes,'./escala.pdf':{},'../preventivas/preventivas.service':{}}),calls};
}

test('gestão recebe fila e total de folgas no painel; demais perfis não consultam nem recebem essa fila',()=>{
 for(const role of ['ADMIN','ENCARREGADO_MANUTENCAO','MANUTENCAO_SUPERVISOR']) {
  const {controller,calls}=controllerFixture(),res=response();controller.index({session:{user:{id:1,role}}},res,assert.ifError);
  assert.equal(res.data.totalAprovacoesFolgas,9);assert.equal(res.data.aprovacoesFolgas[0].id,7);assert.equal(calls.length,2);assert.equal(calls[0][1].limit,6);
 }
 for(const role of ['MECANICO','DIRETORIA']) {
  const {controller,calls}=controllerFixture(),res=response();controller.index({session:{user:{id:1,role}}},res,assert.ifError);
  assert.equal(res.data.totalAprovacoesFolgas,0);assert.equal(res.data.aprovacoesFolgas.length,0);assert.equal(calls.length,0);
 }
});

test('fila conta somente solicitações pendentes de perfis presentes na Escala e preserva conflitos',t=>{
 const db=new Database(':memory:');t.after(()=>db.close());
 db.exec(`CREATE TABLE colaboradores(id INTEGER PRIMARY KEY,nome TEXT,funcao TEXT,fora_escala INTEGER DEFAULT 0);
 CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT);
 CREATE TABLE escala_folga_solicitacoes(id INTEGER PRIMARY KEY,colaborador_id INTEGER,status TEXT,data_folga TEXT,decidido_por INTEGER,minutos_solicitados INTEGER);
 CREATE TABLE escala_folgas_programadas(id INTEGER PRIMARY KEY,colaborador_id INTEGER,status TEXT,tipo_lancamento TEXT,data_folga TEXT,data_fim TEXT);
 CREATE TABLE escala_ausencias(id INTEGER PRIMARY KEY,colaborador_id INTEGER,data_inicio TEXT,data_fim TEXT);
 INSERT INTO colaboradores VALUES(1,'Colaborador A','MECANICO',0),(2,'Colaborador B','MECANICO',0),(3,'Removido','MECANICO',1);
 INSERT INTO escala_folga_solicitacoes VALUES(1,1,'PENDENTE_APROVACAO','2026-11-04',NULL,60),(2,2,'PENDENTE_APROVACAO','2026-11-05',NULL,240),(3,3,'PENDENTE_APROVACAO','2026-11-04',NULL,480),(4,1,'APROVADA','2026-11-05',1,60);
 INSERT INTO escala_folgas_programadas VALUES(9,2,'PROGRAMADA','FOLGA_COMPENSATORIA','2026-11-04','2026-11-04');`);
 const service=load('modules/escala/escala.folga-solicitacao.service.js',{'../../database/db':db,'./escala.service':{calcularSaldoBancoHoras:()=>({minutos:720})}});
 assert.equal(service.contarPendentes(),2);
 const rows=service.listarPendentesParaAprovacao({limit:1});assert.equal(rows.length,1);assert.equal(rows[0].id,1);assert.equal(rows[0].saldo_atual_minutos,720);assert.equal(rows[0].saldo_previsto_minutos,660);assert.equal(rows[0].conflito_dia.temFolgaAprovada,true);
 db.prepare("UPDATE escala_folga_solicitacoes SET status='REPROVADA' WHERE id=1").run();assert.equal(service.contarPendentes(),1);
});

test('aprovação e reprovação retornam à central somente com destino interno autorizado',()=>{
 for(const action of ['aprovarSolicitacao','reprovarSolicitacao']) for(const [destino,expected] of [['/escala#aprovacoes-folgas','/escala#aprovacoes-folgas'],['https://externo.example','/escala/folgas'],[undefined,'/escala/folgas']]) {
  const decisions=[],notifications=[];
  const controller=load('modules/escala/escala.folga.controller.js',{'./escala.service':{},'./escala.folga-solicitacao.service':{[action]:(...args)=>decisions.push(args)},'../rh/rh.notifications':{notifyLeaveDecision:(...args)=>notifications.push(args)}});
  const user={id:41,role:'ADMIN'},res=response(),req={session:{user},params:{id:'8'},body:{voltar_para:destino,motivo:'Ajuste de data',autorizar_excecao:'1',justificativa_excecao:'Cobertura da equipe confirmada'},flash(){}};
  controller[action](req,res);assert.equal(res.url,expected);assert.equal(decisions[0][0],8);assert.equal(decisions[0][1],user);assert.equal(notifications.length,1);
 }
});

test('validação recusada preserva a solicitação e não envia decisão de aprovação',()=>{
 let notified=false;const messages=[];
 const controller=load('modules/escala/escala.folga.controller.js',{'./escala.service':{},'./escala.folga-solicitacao.service':{aprovarSolicitacao(){throw Error('Saldo insuficiente.');}},'../rh/rh.notifications':{notifyLeaveDecision(){notified=true;}}});
 const res=response();controller.aprovarSolicitacao({session:{user:{id:1,role:'ADMIN'}},params:{id:'3'},body:{voltar_para:'/escala#aprovacoes-folgas'},flash:(type,text)=>messages.push([type,text])},res);
 assert.equal(res.url,'/escala#aprovacoes-folgas');assert.equal(notified,false);assert.deepEqual(messages,[['error','Saldo insuficiente.']]);
});

test('formulário compartilhado mantém saldo, autorização excepcional, motivo de reprovação e retorno à central',()=>{
 const filename=path.join(root,'views/escala/_aprovacoes-folgas.ejs');
 const html=ejs.render(fs.readFileSync(filename,'utf8'),{pendentesFolga:[{id:6,colaborador_nome:'Pessoa',data_folga:'2026-11-04',minutos_solicitados:60,saldo_atual_minutos:720,saldo_previsto_minutos:660,conflito_dia:{ocupada:true,temFolgaAprovada:true,colaboradores:['Outra pessoa']}}],canManageEscala:true,voltarPara:'/escala#aprovacoes-folgas',verTodas:true,totalPendentesFolga:9,dateBr:require('../utils/data-hora-br')});
 assert.match(html,/9 pendente/);assert.match(html,/action="\/escala\/folgas\/solicitacoes\/6\/aprovar"/);assert.match(html,/name="autorizar_excecao" value="1" required/);assert.match(html,/name="justificativa_excecao" minlength="10" required/);assert.match(html,/name="motivo"[^>]*required/);assert.match(html,/name="voltar_para" value="\/escala#aprovacoes-folgas"/);assert.match(html,/11h00/);
});
