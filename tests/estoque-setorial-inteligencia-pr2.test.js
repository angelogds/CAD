const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Database=require('better-sqlite3');
const ejs=require('ejs');
const root=path.resolve(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('PR2 adiciona dimensão setorial sem criar saldo paralelo',()=>{
  const migration=read('database/migrations/214_estoque_setorial_inteligencia_reposicao.js');
  assert.match(migration,/setor_utilizacao/);
  assert.match(migration,/subarea_centro_custo/);
  assert.doesNotMatch(migration,/CREATE TABLE IF NOT EXISTS estoque_saldos_setoriais/);
});

test('migration 214 é aditiva e preserva tabelas existentes',()=>{
  const db=new Database(':memory:');
  db.exec('CREATE TABLE estoque_itens(id INTEGER PRIMARY KEY,nome TEXT,ativo INTEGER DEFAULT 1); CREATE TABLE estoque_movimentos(id INTEGER PRIMARY KEY,item_id INTEGER,tipo TEXT,quantidade REAL,created_at TEXT);');
  const tableExists=n=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(n);
  const addColumnIfMissing=(t,n,ddl)=>{if(!db.prepare(`PRAGMA table_info(${t})`).all().some(c=>c.name===n))db.exec(`ALTER TABLE ${t} ADD COLUMN ${ddl}`);};
  require('../database/migrations/214_estoque_setorial_inteligencia_reposicao')({db,tableExists,addColumnIfMissing});
  const cols=new Set(db.prepare('PRAGMA table_info(estoque_itens)').all().map(c=>c.name));
  ['setor_utilizacao','subarea_centro_custo','consumo_medio_mensal','dias_cobertura_reposicao'].forEach(c=>assert.ok(cols.has(c)));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM estoque_itens').get().n,0);
  db.close();
});

test('serviço calcula consumo, rotação e reposição usando movimentos reais',()=>{
  const service=read('modules/estoque/estoque.service.js');
  assert.match(service,/consumo_90d/);
  assert.match(service,/UPPER\(COALESCE\(em\.tipo,''\)\) LIKE 'SAIDA%'/);
  assert.match(service,/PROGRAMAR_REPOSICAO/);
  assert.match(service,/maisRotacionados/);
  assert.match(service,/SETORES_ESTOQUE/);
});

test('telas da fase 2 compilam e expõem utilização e inteligência',()=>{
  for(const name of ['index.ejs','novo_item.ejs']){
    const source=read('views/estoque/'+name);
    assert.doesNotThrow(()=>ejs.compile(source,{filename:path.join(root,'views/estoque',name)}),name);
  }
  const view=read('views/estoque/index.ejs');
  assert.match(view,/inteligência de reposição/i);
  assert.match(view,/Materiais mais rotacionados/);
  assert.match(view,/Centro de custo/);
  assert.match(view,/COMUM/);
  assert.match(read('public/css/estoque-setorial-v2.css'),/stock-sector-cards/);
});
