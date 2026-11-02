const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ejs=require('ejs');
const root=path.join(__dirname,'../views/almoxarifado');
const render=(file,data)=>ejs.render(fs.readFileSync(path.join(root,file),'utf8'),{layout(){},...data},{filename:path.join(root,file)});
const sol={id:1,numero:'SOL-TESTE',titulo:'Teste',status:'EM_COTACAO',setor_origem:'RECICLAGEM',itens:[
  {id:11,item_nome:'Fio <teste>',unidade:'UN',status_compra:'COMPRADO',qtd_comprada:4,qtd_recebida_total:1},
  {id:12,item_nome:'Alicate pendente',unidade:'UN',status_compra:'PENDENTE',qtd_solicitada:2},
  {id:13,item_nome:'Cancelado oculto',status_compra:'CANCELADO',qtd_comprada:7}
]};

test('conferência de pedido misto recebe só a linha comprada, limita ao restante e escapa descrição',()=>{
  const html=render('_itens-recebimento.ejs',{sol,canManage:true,operacaoToken:'teste'});
  assert.equal((html.match(/<form /g)||[]).length,1);
  assert.match(html,/itens\/11\/receber/);
  assert.match(html,/max="3"/);
  assert.match(html,/name="operacao_token" value="teste-11"/);
  assert.match(html,/Fio &lt;teste&gt;/);
  assert.match(html,/Alicate pendente/);
  assert.doesNotMatch(html,/Cancelado oculto/);
  assert.doesNotMatch(html,/name="destino_estoque"|name="categoria_id"/);
  assert.equal((html.match(/>OK<\/button>/g)||[]).length,1);
});

test('perfil de consulta vê os itens sem controles de recebimento',()=>{
  const html=render('_itens-recebimento.ejs',{sol,canManage:false,operacaoToken:'teste'});
  assert.doesNotMatch(html,/<form|qtd_recebida_agora/);
  assert.match(html,/Alicate pendente/);
});

test('solicitação fechada não oferece novo recebimento mesmo com divergência histórica',()=>{
  const html=render('_itens-recebimento.ejs',{sol:{...sol,status:'FECHADA'},canManage:true,operacaoToken:'teste'});
  assert.doesNotMatch(html,/<form/);
});

test('item recebido integralmente exibe situação sem novo botão OK',()=>{
  const html=render('_itens-recebimento.ejs',{sol:{...sol,itens:[{...sol.itens[0],qtd_recebida_total:4}]},canManage:true,operacaoToken:'teste'});
  assert.match(html,/Recebido ✓/);
  assert.doesNotMatch(html,/<form/);
});

test('navegação reúne quatro acessos principais e preserva operações do estoque no contexto',()=>{
  const html=render('_tabs.ejs',{tab:'retiradas'});
  const principal=html.match(/<nav class="almox-tabs[\s\S]*?<\/nav>/)[0];
  assert.equal((principal.match(/<a /g)||[]).length,4);
  for(const url of ['/almoxarifado','/almoxarifado/recebimentos','/almoxarifado/estoque','/almoxarifado/gerencial'])assert.ok(principal.includes(url));
  assert.match(html,/href="\/almoxarifado\/retiradas\/qr" aria-current="page"/);
  assert.match(html,/href="\/almoxarifado\/correias"/);
});
