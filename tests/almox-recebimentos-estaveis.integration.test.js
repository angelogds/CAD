const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-recebimentos-estaveis-'));
process.env.DATA_DIR = dir;
process.env.DB_PATH = path.join(dir, 'test.sqlite');
execFileSync(process.execPath, [path.join(__dirname, '../database/migrate.js')], { env: process.env, stdio: 'pipe' });
const db = require('../database/db');
// Algumas bases legadas não têm local_id. Exercita a variante com localização
// antes de carregar os serviços, que detectam colunas opcionais ao iniciar.
if (!db.prepare('PRAGMA table_info(estoque_itens)').all().some(col => col.name === 'local_id')) {
  db.exec('ALTER TABLE estoque_itens ADD COLUMN local_id INTEGER REFERENCES estoque_locais(id)');
}
const compras = require('../modules/compras/compras.service');
const almox = require('../modules/almoxarifado/almoxarifado.service');
const estoque = require('../modules/estoque/estoque.service');

const userId = Number(db.prepare("INSERT INTO users(name,email,password_hash,role,ativo) VALUES('Teste almox','recebimentos@example.invalid','fixture','ADMIN',1)").run().lastInsertRowid);
const fornecedorId = Number(db.prepare("INSERT INTO fornecedores(nome,ativo) VALUES('Fornecedor de teste',1)").run().lastInsertRowid);
let seq = 0;
function material(nome, setor = 'RECICLAGEM', localId = null) {
  return estoque.createItem({ codigo: `ESTAVEL-${++seq}`, nome, unidade: 'UN', setor_utilizacao: setor, local_id: localId });
}
function pedido({ nome = 'Material de teste', setor = 'RECICLAGEM', estoqueItemId = null, quantidade = 10, comprada = 4, recebida = 0, status = 'COMPRADA', statusCompra = 'COMPRADO' } = {}) {
  const id = Number(db.prepare(`INSERT INTO solicitacoes(numero,titulo,solicitante_user_id,setor_origem,status,disponivel_compras)
    VALUES(?,?,?,?,?,1)`).run(`ESTAVEL-${++seq}`, 'Solicitação de teste', userId, setor, status).lastInsertRowid);
  const itemId = Number(db.prepare(`INSERT INTO solicitacao_itens(solicitacao_id,item_nome,unidade,qtd_solicitada,estoque_item_id,
    status_cotacao,status_compra,qtd_comprada,qtd_recebida_total,fornecedor_id,valor_unitario_centavos)
    VALUES(?,?,'UN',?,?,'COTADO',?,?,?,?,1000)`).run(id, nome, quantidade, estoqueItemId, statusCompra, comprada, recebida, fornecedorId).lastInsertRowid);
  return { id, itemId };
}
function salvar(sol, extra = {}) {
  return compras.salvarPainelItens(sol.id, {
    acao: 'salvar', item_id: [sol.itemId], fornecedor_id: [fornecedorId],
    valor_unitario: ['10,00'], cotado: [sol.itemId], ...extra,
  }, userId);
}
const item = id => db.prepare('SELECT * FROM solicitacao_itens WHERE id=?').get(id);
const status = id => db.prepare('SELECT status FROM solicitacoes WHERE id=?').get(id).status;
const receber = (sol, extra = {}) => almox.receberItem({ solicitacaoId: sol.id, itemId: sol.itemId, qtdAgora: 1, userId, ...extra });
test.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

for (const etapa of ['RECEBIDA_TOTAL', 'FECHADA', 'SEPARADA_PARA_RETIRADA', 'ENTREGUE_SOLICITANTE']) {
  test(`salvar Compras preserva compra já recebida e etapa ${etapa}, mesmo após consumo do estoque`, () => {
    const stockId = material(`Recebido ${etapa}`);
    const sol = pedido({ estoqueItemId: stockId, recebida: 4, status: etapa });
    // A compra foi de apenas 4 das 10 solicitadas. O saldo atual não redefine essa compra histórica.
    db.prepare('UPDATE estoque_itens SET saldo_atual=0 WHERE id=?').run(stockId);
    const antes = item(sol.itemId);
    salvar(sol);
    assert.deepEqual(item(sol.itemId), antes);
    assert.equal(status(sol.id), etapa);
    assert.equal(almox.getSolicitacao(sol.id).resumo.qtd_pendente, 0);
  });
}

test('compra parcial mantém somente o restante original e ignora nova quantidade enviada pelo painel', () => {
  const stockId = material('Recebimento parcial estável');
  const sol = pedido({ estoqueItemId: stockId, recebida: 2, status: 'RECEBIDA_PARCIAL' });
  salvar(sol, { qtd_comprada: ['10'], valor_unitario: ['999,00'], fornecedor_id: [''], cotado: [], atendido_estoque: [sol.itemId] });
  assert.equal(item(sol.itemId).qtd_comprada, 4);
  assert.equal(item(sol.itemId).valor_unitario_centavos, 1000);
  assert.equal(item(sol.itemId).status_compra, 'COMPRADO');
  assert.equal(item(sol.itemId).qtd_recebida_total, 2);
  assert.equal(almox.getSolicitacao(sol.id).resumo.qtd_pendente, 2);
});

test('saldo maior após outras entradas não bloqueia salvar uma compra já efetivada', () => {
  const stockId = material('Compra anterior ao saldo novo');
  const sol = pedido({ estoqueItemId: stockId });
  db.prepare('UPDATE estoque_itens SET saldo_atual=20 WHERE id=?').run(stockId);
  salvar(sol, { qtd_comprada: ['4'] });
  assert.equal(item(sol.itemId).qtd_comprada, 4);
});

for (const encerrado of ['CANCELADO', 'ATENDIDO_ESTOQUE']) {
  test(`salvar um painel antigo não reativa item ${encerrado}`, () => {
    const sol = pedido({ statusCompra: encerrado, comprada: 0, status: 'EM_COTACAO' });
    const antes = item(sol.itemId);
    salvar(sol);
    assert.deepEqual(item(sol.itemId), antes);
  });
}

for (const etapa of ['EM_COTACAO', 'ENTREGUE_SOLICITANTE']) {
  test(`salvar nova linha de pedido misto em ${etapa} mantém a compra recebida e permite cotar o restante`, () => {
    const sol = pedido({ recebida: 4, status: etapa });
    const nextId = Number(db.prepare(`INSERT INTO solicitacao_itens(solicitacao_id,item_nome,unidade,qtd_solicitada,status_compra)
      VALUES(?,'Segundo material','UN',3,'PENDENTE')`).run(sol.id).lastInsertRowid);
    const antes = item(sol.itemId);
    salvar(sol, { item_id: [sol.itemId, nextId], fornecedor_id: [fornecedorId, fornecedorId], valor_unitario: ['10,00', '5,00'], cotado: [sol.itemId, nextId] });
    assert.deepEqual(item(sol.itemId), antes);
    assert.equal(item(nextId).status_cotacao, 'COTADO');
    assert.equal(item(nextId).status_compra, 'PENDENTE');
    assert.equal(status(sol.id), 'EM_COTACAO');
  });
}

test('nova compra ainda exige confirmação para quantidade acima da necessidade', () => {
  const stockId = material('Compra nova com excesso');
  db.prepare('UPDATE estoque_itens SET saldo_atual=7 WHERE id=?').run(stockId);
  const sol = pedido({ estoqueItemId: stockId, comprada: null, statusCompra: 'PENDENTE', status: 'EM_COTACAO' });
  assert.throws(() => salvar(sol, { acao: 'comprar', comprar: [sol.itemId], qtd_comprada: ['4'] }), /acima da necessidade/);
  salvar(sol, { acao: 'comprar', comprar: [sol.itemId], qtd_comprada: ['3'] });
  assert.equal(item(sol.itemId).qtd_comprada, 3);
  assert.equal(item(sol.itemId).status_compra, 'COMPRADO');
});

test('busca por nome não mistura estoque da Reciclagem com recebimento do Frigorífico', () => {
  const nome = 'Mesmo nome em setores diferentes';
  const reciclagemId = material(nome);
  const sol = pedido({ nome, setor: 'FRIGORIFICO' });
  const result = receber(sol);
  assert.notEqual(result.estoqueItemId, reciclagemId);
  assert.equal(estoque.getItem(reciclagemId).saldo_atual, 0);
  assert.equal(estoque.getItem(result.estoqueItemId).setor_utilizacao, 'FRIGORÍFICO');
  assert.equal(estoque.getItem(result.estoqueItemId).saldo_atual, 1);
});

for (const setor of ['RECICLAGEM', 'FRIGORIFICO', 'LOGISTICA', 'ADMINISTRATIVO']) {
  test(`busca por nome reutiliza somente material do setor ${setor}`, () => {
    const nome = `Material setorial ${setor}`;
    const stockId = material(nome, setor);
    // Verifica também a grafia legada sem acento persistida no banco.
    db.prepare('UPDATE estoque_itens SET setor_utilizacao=? WHERE id=?').run(setor, stockId);
    const sol = pedido({ nome, setor });
    assert.equal(receber(sol).estoqueItemId, stockId);
    assert.equal(estoque.getItem(stockId).saldo_atual, 1);
  });
}

test('vínculo explícito a material de outro setor recusa entrada sem alterar saldos ou histórico', () => {
  const stockId = material('Vínculo setorial incompatível');
  const sol = pedido({ setor: 'ADMINISTRATIVO', estoqueItemId: stockId });
  const movimentos = db.prepare('SELECT COUNT(*) n FROM estoque_movimentos').get().n;
  assert.throws(() => receber(sol), /setor.*solicitação/i);
  assert.equal(estoque.getItem(stockId).saldo_atual, 0);
  assert.equal(item(sol.itemId).qtd_recebida_total, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM estoque_movimentos').get().n, movimentos);
});

test('material COMUM explicitamente vinculado permanece comum e registra setor consumidor correto', () => {
  const stockId = material('Material comum', 'COMUM');
  const sol = pedido({ setor: 'LOGISTICA', estoqueItemId: stockId });
  assert.equal(receber(sol).estoqueItemId, stockId);
  assert.equal(estoque.getItem(stockId).setor_utilizacao, 'COMUM');
  assert.equal(db.prepare('SELECT setor_utilizacao FROM estoque_movimentos WHERE solicitacao_item_id=?').get(sol.itemId).setor_utilizacao, 'LOGÍSTICA');
});

test('local físico informado não recebe saldo em material cadastrado em outro local', () => {
  const local = nome => Number(db.prepare('INSERT INTO estoque_locais(nome,ativo) VALUES(?,1)').run(nome).lastInsertRowid);
  const localA = local('Local de teste A');
  const localB = local('Local de teste B');
  const nome = 'Mesmo nome em locais diferentes';
  const stockId = material(nome, 'RECICLAGEM', localA);
  assert.equal(estoque.getItem(stockId).local_id, localA);
  const sol = pedido({ nome });
  const result = receber(sol, { localId: localB });
  assert.notEqual(result.estoqueItemId, stockId);
  assert.equal(estoque.getItem(stockId).saldo_atual, 0);
  assert.equal(estoque.getItem(result.estoqueItemId).local_id, localB);
  const linked = pedido({ estoqueItemId: stockId });
  assert.throws(() => receber(linked, { localId: localB }), /local.*material/i);
  assert.equal(item(linked.itemId).qtd_recebida_total, 0);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
});
