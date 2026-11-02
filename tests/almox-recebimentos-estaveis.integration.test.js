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
function pedido({ nome = 'Material de teste', setor = 'RECICLAGEM', estoqueItemId = null, quantidade = 10, comprada = 4, recebida = 0, status = 'COMPRADA', statusCompra = 'COMPRADO', equipamentoId = null } = {}) {
  const id = Number(db.prepare(`INSERT INTO solicitacoes(numero,titulo,solicitante_user_id,setor_origem,status,disponivel_compras,equipamento_id)
    VALUES(?,?,?,?,?,1,?)`).run(`ESTAVEL-${++seq}`, 'Solicitação de teste', userId, setor, 'EM_COTACAO', equipamentoId).lastInsertRowid);
  const itemId = Number(db.prepare(`INSERT INTO solicitacao_itens(solicitacao_id,item_nome,unidade,qtd_solicitada,estoque_item_id,
    status_cotacao,status_compra,qtd_comprada,qtd_recebida_total,fornecedor_id,valor_unitario_centavos)
    VALUES(?,?,'UN',?,?,'COTADO',?,?,?,?,1000)`).run(id, nome, quantidade, estoqueItemId, statusCompra, comprada, recebida, fornecedorId).lastInsertRowid);
  db.prepare('UPDATE solicitacoes SET status=? WHERE id=?').run(status, id);
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

for (const etapa of ['EM_COTACAO']) {
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

const equipamentoId = Number(db.prepare("INSERT INTO equipamentos(codigo,nome,setor) VALUES('EQ-RETROFIT','Equipamento de teste','RECICLAGEM')").run().lastInsertRowid);
const colaboradorId = Number(db.prepare("INSERT INTO colaboradores(nome,funcao,setor,status,qr_token,qr_ativo) VALUES('Funcionário de teste','MECANICO','RECICLAGEM','ATIVO','token-lote-teste',1)").run().lastInsertRowid);
const reservas = require('../modules/estoque/estoque.reservas.service');

test('recebimento com equipamento separa automaticamente sem reclassificar o material de prateleira', () => {
  const stockId = material('Material de prateleira preservado');
  const sol = pedido({ estoqueItemId: stockId, equipamentoId });
  const r = receber(sol, { qtdAgora: 4, destinoEstoque: 'GERAL' });
  assert.notEqual(r.estoqueItemId, stockId);
  assert.equal(estoque.getItem(stockId).equipamento_id, null);
  assert.equal(estoque.getItem(r.estoqueItemId).equipamento_id, equipamentoId);
  assert.equal(reservas.resumoPorItem().get(r.estoqueItemId), 4);
  assert.equal(item(sol.itemId).destino_recebimento, 'EQUIPAMENTO');
});

test('sem equipamento, OK recebe para prateleira e não cria reserva para retirada', () => {
  const sol = pedido({ nome: 'Material livre para prateleira' });
  const r = receber(sol, { qtdAgora: 4 });
  assert.equal(item(sol.itemId).destino_recebimento, 'PRATELEIRA');
  assert.equal(estoque.getItem(r.estoqueItemId).saldo_atual, 4);
  assert.equal(reservas.resumoPorItem().get(r.estoqueItemId) || 0, 0);
  assert.equal(status(sol.id), 'RECEBIDA_TOTAL');
});

test('recebimento parcial legado mantém SKU e reserva anteriores ao destino automático', () => {
  const stockId=material('Material legado parcialmente recebido');
  const sol=pedido({estoqueItemId:stockId,equipamentoId,status:'RECEBIDA_PARCIAL'});
  db.prepare('UPDATE estoque_itens SET saldo_atual=2 WHERE id=?').run(stockId);
  db.prepare('UPDATE solicitacao_itens SET qtd_recebida_total=2 WHERE id=?').run(sol.itemId);
  const r=receber(sol,{qtdAgora:2});
  assert.equal(r.estoqueItemId,stockId);
  assert.equal(estoque.getItem(stockId).saldo_atual,4);
  assert.equal(estoque.getItem(stockId).equipamento_id,null);
  assert.equal(db.prepare('SELECT quantidade_reservada FROM estoque_reservas WHERE solicitacao_item_id=?').get(sol.itemId).quantidade_reservada,4);
});

function prepararLote() {
  const sol = pedido({ equipamentoId, nome: `Material lote ${++seq}` });
  const outro = Number(db.prepare(`INSERT INTO solicitacao_itens(solicitacao_id,item_nome,unidade,qtd_solicitada,status_compra,qtd_comprada)
    VALUES(?,?,'UN',3,'COMPRADO',3)`).run(sol.id, `Segundo material lote ${++seq}`).lastInsertRowid);
  receber(sol, { qtdAgora: 4 });
  receber({ ...sol, itemId: outro }, { qtdAgora: 3 });
  const rs = db.prepare('SELECT * FROM estoque_reservas WHERE solicitacao_id=? ORDER BY id').all(sol.id);
  return { sol, rs, data: { solicitacaoId: sol.id, operacaoToken: require('node:crypto').randomUUID(),
    itens: rs.map(r => ({ reservaId: r.id, quantidade: r.quantidade_reservada })), qrCode: 'CGCOL:token-lote-teste', entreguePorUserId: userId } };
}
function snapshotLote(lote) {
  return { saldos: lote.rs.map(r => estoque.getItem(r.estoque_item_id).saldo_atual),
    reservas: db.prepare('SELECT * FROM estoque_reservas WHERE solicitacao_id=? ORDER BY id').all(lote.sol.id),
    movimentos: db.prepare('SELECT id FROM estoque_movimentos WHERE solicitacao_id=? ORDER BY id').all(lote.sol.id), status: status(lote.sol.id) };
}

test('QR confirma todos os itens selecionados em uma operação, com histórico e reenvio idempotente', () => {
  const lote = prepararLote();
  const r = reservas.retirarSelecionados(lote.data);
  assert.equal(r.itens, 2);
  assert.equal(status(lote.sol.id), 'ENTREGUE_SOLICITANTE');
  assert.deepEqual(snapshotLote(lote).saldos, [0,0]);
  const antes = snapshotLote(lote);
  assert.equal(reservas.retirarSelecionados(lote.data).duplicado, true);
  assert.deepEqual(snapshotLote(lote), antes);
  const hist = reservas.historicoRetiradas(lote.sol.id);
  assert.equal(hist.length, 2);
  assert.ok(hist.every(h => h.retirante_nome === 'Funcionário de teste' && h.retirada_lote_token === lote.data.operacaoToken));
  assert.equal(db.prepare('SELECT retirado_por_colaborador_id FROM estoque_movimentos WHERE id=?').get(r.movimentos[0]).retirado_por_colaborador_id, colaboradorId);
});

test('erro na segunda linha reverte a primeira baixa e o token da operação inteira', () => {
  const lote = prepararLote(); const antes = snapshotLote(lote);
  lote.data.itens[1].quantidade = 100;
  assert.throws(() => reservas.retirarSelecionados(lote.data), /acima da reserva/);
  assert.deepEqual(snapshotLote(lote), antes);
  assert.equal(db.prepare('SELECT token FROM estoque_retirada_operacoes WHERE token=?').get(lote.data.operacaoToken), undefined);
});

test('seleção parcial mantém o restante reservado e bloqueia reutilizar token com outro payload', () => {
  const lote = prepararLote(); lote.data.itens = [{ reservaId: lote.rs[0].id, quantidade: 1 }];
  reservas.retirarSelecionados(lote.data);
  assert.deepEqual(snapshotLote(lote).saldos, [3,3]);
  assert.equal(status(lote.sol.id), 'SEPARADA_PARA_RETIRADA');
  assert.throws(() => reservas.retirarSelecionados({ ...lote.data, itens: [{ reservaId: lote.rs[0].id, quantidade: 2 }] }), /outra retirada/);
});

test('batch rejeita QR inativo, seleção vazia, quantidade infinita e materiais de outra solicitação', () => {
  const lote = prepararLote(), outra = prepararLote(); const antes = snapshotLote(lote);
  for (const extra of [{ qrCode: 'CGCOL:inativo' }, { itens: [] }, { itens: [{ reservaId: lote.rs[0].id, quantidade: Infinity }] },
    { itens: [{ reservaId: outra.rs[0].id, quantidade: 1 }] }, { itens: [lote.data.itens[0], lote.data.itens[0]] }]) {
    assert.throws(() => reservas.retirarSelecionados({ ...lote.data, ...extra }));
    assert.deepEqual(snapshotLote(lote), antes);
  }
});

test('identificação manual confirma nome uma única vez para todo o lote', () => {
  const lote = prepararLote(); const data = { ...lote.data, qrCode: '', pessoaTipo: 'COLABORADOR', pessoaId: colaboradorId };
  assert.throws(() => reservas.retirarSelecionados({ ...data, nomeRetirante: 'Nome diferente' }), /nome completo/);
  assert.equal(reservas.retirarSelecionados({ ...data, nomeRetirante: 'Funcionário de teste' }).itens, 2);
});

test('fila exige compra efetiva e encerra o recebimento mesmo com restante ainda em cotação', () => {
  const central = require('../modules/almoxarifado/almoxarifado.solicitacoes.service');
  const aberta = pedido({ status: 'ABERTA', statusCompra: 'PENDENTE', comprada: null, nome: 'Ainda não comprado' });
  const misto = pedido({ status: 'EM_COTACAO', recebida: 4, nome: 'Parte já recebida' });
  db.prepare("INSERT INTO solicitacao_itens(solicitacao_id,item_nome,unidade,qtd_solicitada,status_compra) VALUES(?,'Parte não comprada','UN',2,'PENDENTE')").run(misto.id);
  const finalizada = pedido({ status: 'SEPARADA_PARA_RETIRADA', recebida: 4, nome: 'Recebido para entregar' });
  const antesLiberacao = pedido({ status: 'ABERTA' }); db.prepare('UPDATE solicitacoes SET disponivel_compras=0 WHERE id=?').run(antesLiberacao.id);
  const ab = central.consultar({});
  assert.ok(!ab.idsVisiveis.has(aberta.id)); assert.ok(ab.idsVisiveis.has(misto.id)); assert.ok(!ab.idsVisiveis.has(antesLiberacao.id));
  assert.equal(central.consultar({ q: 'Parte já recebida' }).lista.length, 0);
  assert.equal(central.consultar({ q: 'Parte já recebida', aba:'FECHADAS' }).lista[0].encerrada, true);
  assert.equal(central.consultar({ q: 'Recebido para entregar', aba: 'FECHADAS' }).lista[0].id, finalizada.id);
  assert.equal(central.consultar({ q: 'Ainda não comprado', situacao: 'PENDENTES' }).lista.length, 0);
  assert.ok(central.consultar({q:'Fornecedor de teste'}).idsVisiveis.has(misto.id));
});

test('alertas de reposição ignoram compras para equipamento e materiais sem política', () => {
  const reposicao = require('../modules/estoque/estoque.reposicao.service');
  const semPolitica = material('Material sem política');
  const dedicado = material('Material dedicado sem reposição');
  db.prepare('UPDATE estoque_itens SET equipamento_id=?,saldo_minimo=4 WHERE id=?').run(equipamentoId, dedicado);
  assert.ok(!reposicao.resumo().some(i => i.id === semPolitica || i.id === dedicado));
  const inteligencia=estoque.getInteligenciaReposicao();
  assert.ok(!inteligencia.criticos.some(i=>i.id===semPolitica||i.id===dedicado));
  assert.equal(estoque.listItens().find(i=>i.id===dedicado).reposicao_status,'SEM_POLITICA');
});

test('estoque reconhece setores legados sem acento e reposição do Frigorífico gera rascunho correto', () => {
  for(const [legado,canonical] of [['FRIGORIFICO','FRIGORÍFICO'],['LOGISTICA','LOGÍSTICA'],['RECICLAGEM','RECICLAGEM'],['ADMINISTRATIVO','ADMINISTRATIVO']]) {
    const id=material(`Material legado ${legado}`,legado);
    db.prepare('UPDATE estoque_itens SET setor_utilizacao=? WHERE id=?').run(legado.toLowerCase(),id);
    const row=estoque.listItens({setor_utilizacao:canonical}).find(i=>i.id===id);
    assert.ok(row); assert.equal(row.setor_utilizacao_exibicao,canonical);
    assert.ok(!estoque.listItens({setor_utilizacao:'COMUM'}).some(i=>i.id===id));
  }
  const id=material('Material de reposição frigorífico','FRIGORIFICO');
  const reposicao=require('../modules/estoque/estoque.reposicao.service');
  reposicao.salvar(id,{saldo_minimo:1,ponto_reposicao:2,saldo_alvo:5,prazo_reposicao_dias:2,unidade_compra:'UN',fator_compra:1});
  const geradas=reposicao.gerar({id:userId,role:'ADMIN'});
  assert.ok(geradas.length>0);
  const vinculo=db.prepare('SELECT s.setor_origem,s.disponivel_compras FROM estoque_reposicao_vinculos v JOIN solicitacoes s ON s.id=v.solicitacao_id WHERE v.estoque_item_id=?').get(id);
  assert.equal(require('../modules/compras/compras-setores').normalizeSetorCorporativo(vinculo.setor_origem),'FRIGORÍFICO');
  assert.equal(vinculo.disponivel_compras,0);
});

test('leitor QR de fallback decodifica cartão sem BarcodeDetector nativo', () => {
  const code = 'CGCOL:token-lote-teste';
  const matrix = require('qrcode').create(code).modules;
  const scale = 5, quiet = 4, size = (matrix.size + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y=0;y<matrix.size;y++) for(let x=0;x<matrix.size;x++) if(matrix.get(y,x)) {
    for(let dy=0;dy<scale;dy++) for(let dx=0;dx<scale;dx++) {
      const n=(((y+quiet)*scale+dy)*size+(x+quiet)*scale+dx)*4;
      pixels[n]=pixels[n+1]=pixels[n+2]=0;
    }
  }
  assert.equal(require('jsqr')(pixels,size,size).data, code);
});

test('troca na preventiva baixa uma vez e a conclusão não repete o consumo', () => {
  const belts = require('../modules/correias/correias.fluxo.service');
  const mecanicoId = Number(db.prepare("INSERT INTO users(name,email,password_hash,role,ativo) VALUES('Mecânico de teste','mec-retrofit@example.invalid','fixture','MECANICO',1)").run().lastInsertRowid);
  const outroId = Number(db.prepare("INSERT INTO users(name,email,password_hash,role,ativo) VALUES('Outro mecânico','outro-retrofit@example.invalid','fixture','MECANICO',1)").run().lastInsertRowid);
  const stockId = material('Correia preventiva teste', 'COMUM');
  db.prepare('UPDATE estoque_itens SET saldo_atual=10 WHERE id=?').run(stockId);
  const planoId = Number(db.prepare("INSERT INTO preventiva_planos(equipamento_id,titulo,tipo_plano,estoque_item_id,quantidade_material,frequencia_tipo,baixa_estoque_automatica) VALUES(?,'Correia teste','TROCA_CORREIA',?,2,'semanal',1)").run(equipamentoId, stockId).lastInsertRowid);
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone:'America/Sao_Paulo' });
  const execId = Number(db.prepare("INSERT INTO preventiva_execucoes(plano_id,status,responsavel_1_id,data_prevista) VALUES(?,'PENDENTE',?,?)").run(planoId,mecanicoId,hoje).lastInsertRowid);
  const data = { plano_id: planoId, preventiva_execucao_id: execId, estoque_item_id: stockId, quantidade: 2,
    troca_em: hoje, empresa_consumidora:'Empresa de teste',setor_consumidor:'RECICLAGEM' };
  const mecanico = { id:mecanicoId,role:'MECANICO' };
  assert.throws(() => belts.registrarTrocaPreventiva(data, { id:outroId,role:'MECANICO' }), /outro responsável/);
  const r = belts.registrarTrocaPreventiva(data,mecanico);
  assert.equal(estoque.getItem(stockId).saldo_atual,8);
  assert.equal(belts.registrarTrocaPreventiva(data,mecanico).duplicado,true);
  assert.equal(require('../modules/correias/correias.service').baixarEstoquePreventiva({planoId,execId,userId:mecanicoId}).skipped,true);
  assert.equal(estoque.getItem(stockId).saldo_atual,8);
  assert.equal(db.prepare('SELECT status FROM correias_pedidos WHERE id=?').get(r.pedidoId).status,'TROCADA');
  const exec2 = Number(db.prepare("INSERT INTO preventiva_execucoes(plano_id,status,responsavel_1_id,data_prevista) VALUES(?,'PENDENTE',?,?)").run(planoId,mecanicoId,hoje).lastInsertRowid);
  const withDraw = { ...data,preventiva_execucao_id:exec2,mecanico_user_id:mecanicoId };
  const pedidoId = belts.solicitar(withDraw,mecanico);
  belts.entregar(pedidoId,{id:userId,role:'ADMIN'});
  assert.equal(estoque.getItem(stockId).saldo_atual,6);
  belts.registrarTrocaPreventiva(withDraw,mecanico);
  assert.equal(estoque.getItem(stockId).saldo_atual,6);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM estoque_movimentos WHERE item_id=? AND tipo LIKE \'SAIDA%\'').get(stockId).n,2);
});

test('migration é idempotente e preserva reservas e movimentações históricas', () => {
  const antes = db.prepare('SELECT * FROM estoque_reservas ORDER BY id').all();
  const movimentos = db.prepare('SELECT * FROM estoque_movimentos ORDER BY id').all();
  const tableExists = name => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  const addColumnIfMissing = (table,name,ddl) => { if(!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name===name))db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`); };
  for(let i=0;i<2;i++)require('../database/migrations/240_almox_retirada_lote_destino')({db,tableExists,addColumnIfMissing});
  assert.deepEqual(db.prepare('SELECT * FROM estoque_reservas ORDER BY id').all(),antes);
  assert.deepEqual(db.prepare('SELECT * FROM estoque_movimentos ORDER BY id').all(),movimentos);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('entregue ou fechada permanece terminal mesmo com reserva histórica pendente', () => {
  const fluxo=require('../modules/estoque/estoque.solicitacao-fluxo.service');
  for(const terminal of ['ENTREGUE_SOLICITANTE','FECHADA']) {
    const lote=prepararLote();
    db.prepare('UPDATE solicitacoes SET status=? WHERE id=?').run(terminal,lote.sol.id);
    const antes=snapshotLote(lote);
    assert.equal(fluxo.syncSolicitacaoEntregaStatus(lote.sol.id).changed,false);
    assert.ok(!reservas.listSolicitacoes().some(s=>s.solicitacao_id===lote.sol.id));
    assert.equal(reservas.resumoPorItem().get(lote.rs[0].estoque_item_id)||0,0);
    assert.throws(()=>db.prepare("UPDATE solicitacoes SET status='SEPARADA_PARA_RETIRADA' WHERE id=?").run(lote.sol.id),/não pode ser reaberta/);
    assert.throws(()=>db.prepare("INSERT INTO solicitacao_itens(solicitacao_id,item_nome,unidade,qtd_solicitada) VALUES(?,'Tentativa','UN',1)").run(lote.sol.id),/não aceita novos itens/);
    assert.throws(()=>db.prepare('UPDATE solicitacao_itens SET qtd_comprada=99 WHERE id=?').run(lote.sol.itemId),/não pode ser alterado/);
    assert.throws(()=>db.prepare('UPDATE estoque_reservas SET quantidade_reservada=99 WHERE id=?').run(lote.rs[0].id),/não pode ser reaberta/);
    assert.throws(()=>almox.reabrir(lote.sol.id),/não podem ser reabertas/);
    assert.throws(()=>compras.resolverItemPorEstoque(lote.sol.id,lote.sol.itemId,userId),/encerrada/);
    require('../database/migrations/241_almox_encerramento_definitivo')({db,tableExists:t=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t)});
    assert.deepEqual(snapshotLote(lote),antes);
  }
});

test('um comprado de dez aparece no almox; somente cotados ficam em Compras', () => {
  const central=require('../modules/almoxarifado/almoxarifado.solicitacoes.service');
  const sol=pedido({nome:'Único comprado entre dez',quantidade:1,comprada:1});
  for(let n=0;n<9;n++)db.prepare("INSERT INTO solicitacao_itens(solicitacao_id,item_nome,unidade,qtd_solicitada,status_cotacao,status_compra) VALUES(?,?,'UN',2,'COTADO','PENDENTE')").run(sol.id,'Em cotação '+n);
  const row=central.consultar({q:'Único comprado entre dez'}).lista[0];
  assert.equal(row.itens_comprados,1);assert.equal(row.itens_total,10);assert.equal(row.itens_a_receber,1);
  const cotada=pedido({nome:'Somente cotado sem compra',comprada:null,statusCompra:'PENDENTE',status:'COTADA'});
  assert.ok(!central.consultar({q:'Somente cotado sem compra'}).idsVisiveis.has(cotada.id));
});

test('estoque operacional mostra saldo livre positivo e preserva retiradas parciais e totais no histórico', () => {
  const nome='Saldo operacional único '+(++seq),stockId=material(nome);
  const sol=pedido({nome,quantidade:4,comprada:4,estoqueItemId:stockId});
  receber(sol,{qtdAgora:4});
  const osId=Number(db.prepare("INSERT INTO os(equipamento_id,equipamento,descricao,status) VALUES(?,'Equipamento de teste','OS de retirada','ABERTA')").run(equipamentoId).lastInsertRowid);
  const available=controller=>{let data;controller({query:{q:nome},session:{user:{id:userId,role:'ADMIN'}}},{render:(view,d)=>{data=d;}});return data.itens.find(i=>i.id===stockId);};
  const ctrl=require('../modules/almoxarifado/almoxarifado.controller'),stockCtrl=require('../modules/estoque/estoque.controller');
  estoque.registrarSaida({item_id:stockId,quantidade:1,os_id:osId,usuario_id:userId,observacao:'Retirada parcial'});
  assert.equal(available(ctrl.estoqueOperacional).saldo_disponivel,3);
  assert.equal(available(stockCtrl.index).saldo_disponivel,3);
  estoque.registrarSaida({item_id:stockId,quantidade:3,os_id:osId,usuario_id:userId,observacao:'Retirada total'});
  assert.equal(available(ctrl.estoqueOperacional),undefined);assert.equal(available(stockCtrl.index),undefined);
  assert.ok(estoque.getItem(stockId));
  const history=reservas.consultarRetiradas({q:nome,limite:1,pagina:2});
  assert.equal(history.total,2);assert.equal(history.paginas,2);assert.equal(history.lista.length,1);assert.equal(history.lista[0].quantidade,1);
});

test('QR de colaborador vinculado registra os dois IDs e a entrega usa o perfil autenticado', () => {
  const linkedId=Number(db.prepare("INSERT INTO users(name,email,password_hash,role,ativo) VALUES('Perfil mecânico QR','perfil-qr@example.invalid','fixture','MECANICO',1)").run().lastInsertRowid);
  const colId=Number(db.prepare("INSERT INTO colaboradores(nome,funcao,setor,status,qr_token,qr_ativo,user_id) VALUES('Cadastro do mecânico','MECANICO','RECICLAGEM','ATIVO','token-perfil-vinculado',1,?)").run(linkedId).lastInsertRowid);
  assert.equal(reservas.getPessoaByQr('CGCOL:token-perfil-vinculado').user_id,linkedId);
  const lote=prepararLote();const body={operacao_token:lote.data.operacaoToken,qr_code:'CGCOL:token-perfil-vinculado',reserva_id:lote.rs.map(r=>String(r.id)),entregue_por_user_id:linkedId};
  for(const r of lote.rs)body['quantidade_'+r.id]=r.quantidade_reservada;
  const messages=[];
  require('../modules/almoxarifado/retiradas-qr.controller').retirarLote({params:{id:lote.sol.id},body,session:{user:{id:userId}},flash:(t,m)=>messages.push({t,m})},{redirect(){}});
  assert.equal(messages[0].t,'success');
  const h=reservas.consultarRetiradas({solicitacaoId:lote.sol.id});
  assert.equal(h.total,2);
  assert.ok(h.lista.every(m=>m.retirado_por_user_id===linkedId&&m.retirado_por_colaborador_id===colId&&m.entregue_por_user_id===userId));
  assert.equal(h.lista[0].retirante_nome,'Perfil mecânico QR');assert.equal(h.lista[0].entregador_nome,'Teste almox');
  db.prepare('UPDATE users SET ativo=0 WHERE id=?').run(linkedId);
  assert.equal(reservas.getPessoaByQr('CGCOL:token-perfil-vinculado'),null);
  assert.equal(reservas.getPessoaByCadastro('COLABORADOR',colId),null);
});
