const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ejs=require('ejs');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('fase 2.1 protege classificação em massa com estoque_manage',()=>{
  const routes=read('modules/estoque/estoque.routes.js');
  assert.match(routes,/\/itens\/classificacao/);
  assert.match(routes,/requireRole\(ACCESS\.estoque_manage\), ctrl\.atualizarClassificacao/);
});

test('classificação em massa altera metadados sem alterar saldo ou histórico',()=>{
  const service=read('modules/estoque/estoque.service.js');
  const start=service.indexOf('function atualizarClassificacaoItens');
  const end=service.indexOf('function getItem',start);
  const block=service.slice(start,end);
  assert.match(block,/setor_utilizacao/);
  assert.match(block,/subarea_centro_custo/);
  assert.doesNotMatch(block,/saldo_atual\s*=/);
  assert.doesNotMatch(block,/DELETE FROM estoque_movimentos/);
  assert.doesNotMatch(block,/UPDATE estoque_movimentos/);
});

test('interface 2.1 compila e oferece seleção, classificação e painel compacto',()=>{
  const view=read('views/estoque/index.ejs');
  assert.doesNotThrow(()=>ejs.compile(view,{filename:path.join(root,'views/estoque/index.ejs')}));
  assert.match(view,/bulkClassForm/);
  assert.match(view,/stock-item-check/);
  assert.match(view,/Aplicar aos selecionados/);
  assert.match(view,/slice\(0,6\)/);
  assert.match(view,/canManage/);
});

test('edição em massa continua limitada aos setores corporativos do estoque',()=>{
  const service=read('modules/estoque/estoque.service.js');
  assert.match(service,/normalizeSetorEstoque\(setor_utilizacao\)/);
  assert.match(service,/Selecione um setor de utilização válido/);
  assert.match(service,/Limite de 500 materiais/);
});
