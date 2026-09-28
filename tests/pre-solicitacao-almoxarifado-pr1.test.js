const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Database=require('better-sqlite3');
const ejs=require('ejs');
const root=path.resolve(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('PR1 possui RBAC separado e rotas protegidas',()=>{
  const rbac=read('config/rbac.js'), routes=read('modules/pre-solicitacoes/pre-solicitacoes.routes.js');
  assert.match(rbac,/pre_solicitacao_almox_create/);
  assert.match(rbac,/pre_solicitacao_setor_approve/);
  assert.match(routes,/ACCESS\.pre_solicitacao_almox_create/);
  assert.match(routes,/ACCESS\.pre_solicitacao_setor_approve/);
});

test('migration 213 é aditiva e cria trilha de aprovação sem apagar dados',()=>{
  const db=new Database(':memory:');
  db.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY);
    CREATE TABLE solicitacoes(id INTEGER PRIMARY KEY,tipo_origem TEXT,setor_origem TEXT,created_at TEXT);
    CREATE TABLE solicitacao_itens(id INTEGER PRIMARY KEY,solicitacao_id INTEGER);
  `);
  const tableExists=n=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(n);
  const addColumnIfMissing=(t,n,ddl)=>{
    if(!db.prepare(`PRAGMA table_info(${t})`).all().some(c=>c.name===n)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${ddl}`);
  };
  require('../database/migrations/213_pre_solicitacao_almoxarifado')({db,tableExists,addColumnIfMissing});
  const solCols=new Set(db.prepare('PRAGMA table_info(solicitacoes)').all().map(c=>c.name));
  const itemCols=new Set(db.prepare('PRAGMA table_info(solicitacao_itens)').all().map(c=>c.name));
  ['pre_status','semana_referencia','subarea_destino','pre_aprovador_user_id'].forEach(c=>assert.ok(solCols.has(c)));
  ['qtd_sugerida_almox','qtd_aprovada_setor','pre_aprovacao_item_status'].forEach(c=>assert.ok(itemCols.has(c)));
  db.close();
});

test('serviço mantém compras bloqueadas até aprovação e preserva quantidade sugerida',()=>{
  const service=read('modules/pre-solicitacoes/pre-solicitacoes.service.js');
  assert.match(service,/disponivel_compras:\s*0/);
  assert.match(service,/qtd_sugerida_almox/);
  assert.match(service,/pre_aprovacao_item_status/);
  assert.match(service,/status_compra='CANCELADO'/);
  assert.match(service,/disponivel_compras:\s*1/);
  assert.match(service,/notifyCompras/);
});

test('telas compilam e possuem fluxo responsivo de criação e aprovação',()=>{
  for(const name of ['index.ejs','form.ejs','show.ejs']){
    const source=read('views/pre-solicitacoes/'+name);
    assert.doesNotThrow(()=>ejs.compile(source,{filename:path.join(root,'views/pre-solicitacoes',name)}),name);
  }
  const form=read('views/pre-solicitacoes/form.ejs');
  const show=read('views/pre-solicitacoes/show.ejs');
  assert.match(form,/Salvar rascunho/);
  assert.match(form,/Enviar para aprovação/);
  assert.match(show,/Aprovar e enviar para Compras/);
  assert.match(show,/Quantidade aprovada/);
  assert.match(form,/pre-item-fields/);
  assert.match(form,/pre-action-bar/);
  assert.match(show,/pre-summary-strip/);
  assert.match(show,/pre-item-metrics/);
  const css=read('public/css/pre-solicitacoes.css');
  assert.match(css,/\.pre-item-spec textarea\{min-height:48px/);
  assert.match(css,/\.pre-form-grid textarea\{min-height:62px/);
  assert.match(css,/\.pre-summary-strip\{/);
});

test('Compras identifica origem do Almoxarifado e lista normal separa triagem',()=>{
  assert.match(read('views/compras/solicitacoes/show.ejs'),/Origem: Pré-Solicitação do Almoxarifado/);
  assert.match(read('views/compras/solicitacoes/index.ejs'),/PRE_SOLICITACAO_ALMOX/);
  assert.match(read('modules/solicitacoes/solicitacoes.service.js'),/PRE_SOLICITACAO_ALMOX/);
});


test('matriz operacional cobre Almoxarifado e responsáveis dos quatro setores',()=>{
  const rbac=read('config/rbac.js');
  const service=read('modules/pre-solicitacoes/pre-solicitacoes.service.js');
  assert.match(rbac,/pre_solicitacao_almox_create:\s*\[ROLE\.ADMIN, ROLE\.ALMOXARIFADO\]/);
  assert.match(service,/\[SETORES\.RECICLAGEM\]:\s*\['ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR', 'SUPERVISOR_MANUTENCAO'\]/);
  assert.match(service,/\[SETORES\.LOGISTICA\]:\s*\['ENCARREGADO_LOGISTICA'\]/);
  assert.match(service,/\[SETORES\.FRIGORIFICO\]:\s*\['ENCARREGADO_FRIGORIFICO'\]/);
  assert.match(service,/\[SETORES\.ADMINISTRATIVO\]:\s*\['RH'\]/);
  assert.match(service,/role === 'ALMOXARIFADO' \|\| role === 'COMPRAS'/);
});
