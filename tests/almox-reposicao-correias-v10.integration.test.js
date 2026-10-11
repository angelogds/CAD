const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cad-almox-v10-'));
process.env.DB_PATH=path.join(dir,'test.sqlite');
execFileSync(process.execPath,[path.join(__dirname,'../database/migrate.js')],{env:process.env,stdio:'pipe'});
const db=require('../database/db');
const estoque=require('../modules/estoque/estoque.service');
const reposicao=require('../modules/estoque/estoque.reposicao.service');
const belts=require('../modules/correias/correias.fluxo.service');
const legacy=require('../modules/correias/correias.service');
const almox=require('../modules/almoxarifado/almoxarifado.service');
const compras=require('../modules/compras/compras.service');
const pre=require('../modules/pre-solicitacoes/pre-solicitacoes.service');
const user=(role)=>{const id=Number(db.prepare('INSERT INTO users(name,email,password_hash,role,ativo) VALUES(?,?,?,?,1)').run('Teste '+role,role.toLowerCase()+Math.random().toString(36).slice(2)+'@fixture.invalid','fixture',role).lastInsertRowid);return {id,role,name:'Teste '+role};};
const almoxUser=user('ALMOXARIFADO'),mecanico=user('MECANICO'),outro=user('MECANICO'),admin=user('ADMIN');
const supervisor=user('MANUTENCAO_SUPERVISOR');
const eq=Number(db.prepare('INSERT INTO equipamentos(codigo,nome,setor) VALUES(?,?,?)').run('EQ-TESTE','Equipamento de teste','RECICLAGEM').lastInsertRowid);
const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Bahia'});
const item=(name,saldo=20)=>{const id=estoque.createItem({codigo:'TESTE-'+Math.random().toString(36).slice(2),nome:name,unidade:'UN',setor_utilizacao:'COMUM'});db.prepare('UPDATE estoque_itens SET saldo_atual=? WHERE id=?').run(saldo,id);return id;};
const correia=item('Correia B teste');
const plano=Number(db.prepare("INSERT INTO preventiva_planos(equipamento_id,titulo,tipo_plano,estoque_item_id,quantidade_material,frequencia_tipo,baixa_estoque_automatica) VALUES(?,'Troca teste','TROCA_CORREIA',?,4,'semanal',1)").run(eq,correia).lastInsertRowid);
const exec=Number(db.prepare("INSERT INTO preventiva_execucoes(plano_id,status,responsavel_1_id,data_prevista) VALUES(?,'PENDENTE',?,?)").run(plano,mecanico.id,today).lastInsertRowid);
const payload={equipamento_id:eq,estoque_item_id:correia,mecanico_user_id:mecanico.id,quantidade:4,empresa_consumidora:'Empresa de teste',setor_consumidor:'RECICLAGEM'};
test.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});

test('reserva de correias protege saldo, entrega é idempotente e conclusão não repete baixa',()=>{
  assert.throws(()=>belts.solicitar({...payload,preventiva_execucao_id:exec},outro),/outro responsável/);
  const id=belts.solicitar({...payload,preventiva_execucao_id:exec},mecanico);
  assert.equal(belts.solicitar({...payload,preventiva_execucao_id:exec},mecanico),id);
  assert.equal(require('../modules/estoque/estoque.reservas.service').resumoPorItem().get(correia),4);
  assert.equal(legacy.getPlanoContext(plano).saldo_livre,16);
  assert.throws(()=>db.prepare('UPDATE estoque_itens SET saldo_atual=3 WHERE id=?').run(correia),/reservado/);
  assert.throws(()=>belts.entregar(id,mecanico),/Almoxarifado/);
  belts.separar(id,almoxUser);
  const mov=belts.entregar(id,almoxUser); assert.equal(belts.entregar(id,almoxUser),mov);
  assert.equal(estoque.getItem(correia).saldo_atual,16);
  assert.throws(()=>legacy.baixarEstoquePreventiva({planoId:plano,execId:exec,userId:mecanico.id}),/confirme a troca/);
  assert.throws(()=>belts.confirmarTroca(id,today,outro),/responsável/);
  belts.confirmarTroca(id,today,mecanico);
  assert.equal(legacy.baixarEstoquePreventiva({planoId:plano,execId:exec,userId:mecanico.id}).skipped,true);
  assert.equal(estoque.getItem(correia).saldo_atual,16);
  assert.equal(db.prepare('SELECT empresa_consumidora,setor_utilizacao,mecanico_user_id FROM estoque_movimentos WHERE id=?').get(mov).mecanico_user_id,mecanico.id);
});

test('retirada avulsa, devolução e falha prematura usam troca real sem mudar preventiva/criticidade',()=>{
  belts.salvarPrazo(eq,30);
  const id=belts.solicitar({...payload,operacao_token:'avulsa-teste'},almoxUser);
  assert.equal(belts.solicitar({...payload,operacao_token:'avulsa-teste'},almoxUser),id);
  belts.entregar(id,almoxUser); belts.devolver(id,1,almoxUser);
  assert.equal(estoque.getItem(correia).saldo_atual,13);
  assert.throws(()=>belts.devolver(id,4,almoxUser),/Quantidade/);
  assert.equal(belts.alertas(eq).length,0);
  belts.confirmarTroca(id,today,mecanico);belts.confirmarTroca(id,today,mecanico);
  assert.equal(belts.alertas(eq).length,1);
  assert.equal(belts.alertas(eq)[0].intervalo_dias,0);
  assert.equal(db.prepare('SELECT status,data_prevista FROM preventiva_execucoes WHERE id=?').get(exec).data_prevista,today);
  assert.equal(db.prepare('SELECT criticidade FROM equipamentos WHERE id=?').get(eq).criticidade,'media');
});

test('mínimo, reservas e chegada geram apenas um rascunho e mantêm aprovação e rateio',()=>{
  const id=item('Eletrodo teste',2);
  reposicao.salvar(id,{saldo_minimo:3,ponto_reposicao:5,saldo_alvo:12,prazo_reposicao_dias:7,unidade_compra:'CX',fator_compra:10,rateio_setores_json:{RECICLAGEM:6,FRIGORIFICO:4}});
  const ids=reposicao.gerar(almoxUser);assert.equal(ids.length,1);assert.equal(reposicao.gerar(almoxUser).length,0);
  const sol=pre.getById(ids[0]);assert.equal(sol.pre_status,'RASCUNHO');assert.equal(sol.setor_origem,'RECICLAGEM');assert.equal(sol.disponivel_compras,0);
  assert.equal(sol.itens[0].qtd_solicitada,10);assert.equal(sol.itens[0].rateio_setores_json,'{"RECICLAGEM":6,"FRIGORIFICO":4}');
  pre.updateDraft(sol.id,{setor_origem:'RECICLAGEM',subarea_destino:'MANUTENÇÃO',semana_referencia:sol.semana_referencia,acao:'rascunho',itens_nome:['Eletrodo teste'],itens_un:['UN'],itens_qtd:[9],itens_item_id:[id]},almoxUser);
  assert.equal(pre.getById(sol.id).itens[0].rateio_setores_json,sol.itens[0].rateio_setores_json);
  db.prepare("UPDATE solicitacoes SET status='COMPRADA',disponivel_compras=1 WHERE id=?").run(sol.id);
  db.prepare("UPDATE solicitacao_itens SET status_compra='COMPRADO',qtd_comprada=9 WHERE solicitacao_id=?").run(sol.id);
  assert.equal(reposicao.resumo().find(i=>i.id===id).a_receber,9);
  const solItem=pre.getById(sol.id).itens[0];
  almox.receberItem({solicitacaoId:sol.id,itemId:solItem.id,qtdAgora:9,userId:almoxUser.id,operacaoToken:'receive-full'});
  assert.equal(estoque.getItem(id).saldo_atual,11);
  assert.equal(estoque.getItem(id).setor_utilizacao,'COMUM');
  assert.equal(require('../modules/estoque/estoque.reservas.service').resumoPorItem().get(id)||0,0);
  assert.ok(!compras.listSolicitacoesPorStatus().some(s=>s.id===sol.id));
  assert.ok(compras.listSolicitacoesPorStatus({historico:true}).some(s=>s.id===sol.id));
  assert.equal(almox.receberItem({solicitacaoId:sol.id,itemId:solItem.id,qtdAgora:9,userId:almoxUser.id,operacaoToken:'receive-full'}).duplicado,true);
  assert.equal(estoque.getItem(id).saldo_atual,11);
});

test('recebimento parcial não encerra saldo pendente e repetição do envio não dobra entrada',()=>{
  const id=item('Material teste parcial',0);
  const solId=require('../modules/solicitacoes/solicitacoes.service').createSolicitacao({userId:admin.id,user:admin,setor_origem:'RECICLAGEM',titulo:'Pedido teste',tipo_aplicacao:'OUTRO',destino_uso:'Manutenção de teste',itens:[{item_nome:'Material teste parcial',unidade:'UN',qtd_solicitada:10,estoque_item_id:id}]});
  db.prepare("UPDATE solicitacoes SET status='COMPRADA',disponivel_compras=1 WHERE id=?").run(solId);
  db.prepare("UPDATE solicitacao_itens SET status_compra='COMPRADO',qtd_comprada=10 WHERE solicitacao_id=?").run(solId);
  const itemId=db.prepare('SELECT id FROM solicitacao_itens WHERE solicitacao_id=?').get(solId).id;
  almox.receberItem({solicitacaoId:solId,itemId,qtdAgora:3,userId:almoxUser.id,operacaoToken:'partial-1'});
  almox.receberItem({solicitacaoId:solId,itemId,qtdAgora:3,userId:almoxUser.id,operacaoToken:'partial-1'});
  assert.equal(estoque.getItem(id).saldo_atual,3);assert.equal(db.prepare('SELECT status FROM solicitacoes WHERE id=?').get(solId).status,'RECEBIDA_PARCIAL');
  assert.ok(compras.listSolicitacoesPorStatus().some(s=>s.id===solId));
  almox.receberItem({solicitacaoId:solId,itemId,qtdAgora:7,userId:almoxUser.id,operacaoToken:'partial-2'});
  assert.equal(estoque.getItem(id).saldo_atual,10);
  assert.ok(!compras.listSolicitacoesPorStatus().some(s=>s.id===solId));
  assert.equal(require('../modules/estoque/estoque.reservas.service').resumoPorItem().get(id),10);
});

test('classificação automática herda endereço sem inventar especificação e migration é idempotente',()=>{
  const rules=require('../modules/estoque/estoque.classificacao.service');const rule=rules.regras().find(r=>r.termo==='FITA ISOLANTE');
  rules.salvarRegra(rule.id,{endereco_estante:'EL-TESTE',endereco_prateleira:'P-TESTE'});
  const id=item('Fita isolante 19 mm teste');const i=estoque.getItem(id);assert.equal(i.categoria_id,rule.categoria_id);assert.equal(i.endereco_estante,'EL-TESTE');assert.equal(i.nome,'Fita isolante 19 mm teste');
  const unknown=item('Material desconhecido teste');assert.equal(estoque.getItem(unknown).classificacao_pendente,1);
  const tableExists=t=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE name=? AND type='table'").get(t);
  const addColumnIfMissing=(t,n,ddl)=>{if(!db.prepare(`PRAGMA table_info(${t})`).all().some(c=>c.name===n))db.exec(`ALTER TABLE ${t} ADD COLUMN ${ddl}`);};
  require('../database/migrations/226_almox_reposicao_correias')({db,tableExists,addColumnIfMissing});
  assert.equal(estoque.getItem(correia).saldo_atual,13);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('telas operacionais renderizam ações corretas e busca preserva a fila a caminho',()=>{
  const ejs=require('ejs');
  const render=(file,locals)=>ejs.render(fs.readFileSync(path.join(__dirname,'../views',file),'utf8'),{layout:()=>{},fmtBR:v=>String(v),...locals},{filename:path.join(__dirname,'../views',file)});
  const filas=render('almoxarifado/recebimentos.ejs',{user:almoxUser,lista:[],status:'TODAS',fila:'A_CAMINHO',q:'correia',resumo:{},canManage:true,canWithdraw:false});
  assert.match(filas,/<h1>Compras a caminho<\/h1>/);assert.match(filas,/name="fila" value="A_CAMINHO"/);
  const base={pedidos:belts.list(),equipamentos:legacy.listEquipamentos(),mecanicos:[mecanico],vinculos:belts.vinculos(eq),operacaoToken:'view-test'};
  const readOnly=render('almoxarifado/correias.ejs',{...base,user:{role:'DIRETORIA'}});assert.doesNotMatch(readOnly,/action="\/almoxarifado\/correias\/avulsa"/);
  const editable=render('almoxarifado/correias.ejs',{...base,user:almoxUser});assert.match(editable,/name="empresa_consumidora"/);assert.match(editable,/name="operacao_token"/);
  const inspection=render('preventivas/_correias-inspecao.ejs',{user:mecanico,plano:{id:plano},execucoes:[{id:exec,status:'PENDENTE',data_prevista:today}],execucoesAutorizadas:[exec],correiasVinculos:belts.vinculos(eq),correiasPedidos:belts.list(eq),correiasMecanicos:[mecanico]});
  assert.match(inspection,new RegExp(`/preventivas/${plano}/execucoes/${exec}/correias`));assert.match(inspection,/Verificar desgaste na próxima inspeção/);
  const policy=render('estoque/show.ejs',{user:almoxUser,item:estoque.getItem(correia),movimentos:[],canManageReposicao:true});assert.match(policy,/name="saldo_alvo"/);assert.match(policy,/MIG tubular 1,2 mm: 15 kg/);
});
