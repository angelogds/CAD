const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Demanda oferece Editar na solicitação e usa rota protegida de acréscimo', () => {
  const view = read('views/demandas/view.ejs');
  const routes = read('modules/demandas/demandas.routes.js');
  const controller = read('modules/demandas/demandas.controller.js');

  assert.match(view, /data-edit-material-request/);
  assert.match(view, />Editar<\/button>/);
  assert.match(view, /Adicionar itens à/);
  assert.match(view, /Itens, cotações, fornecedores e valores já registrados serão preservados/);
  assert.match(view, /Edição encerrada pela OS/);
  assert.match(routes, /:id\/solicitacoes\/:solicitacaoId\/materiais/);
  assert.match(routes, /requireRole\(ACCESS\.demandas_materials\), ctrl\.appendMaterials/);
  assert.match(controller, /demandMaterialsService\.appendItems/);
  assert.match(controller, /mesma solicitação foi atualizada para o setor de Compras/);
});

test('acréscimo é append-only e não reutiliza edição destrutiva da solicitação', () => {
  const service = read('modules/demandas/demandas.materials.service.js');
  assert.match(service, /INSERT INTO solicitacao_itens/);
  assert.doesNotMatch(service, /DELETE FROM\s+solicitacao_itens/i);
  assert.doesNotMatch(service, /updateSolicitacao/);
  assert.match(service, /status_cotacao: 'PENDENTE'/);
  assert.match(service, /status_compra: 'PENDENTE'/);
  assert.match(service, /DEMANDA_MATERIAIS_BLOQUEADOS_POR_OS/);
});

test('botões de criar/editar materiais desaparecem após existir OS vinculada', () => {
  const view = read('views/demandas/view.ejs');
  const controller = read('modules/demandas/demandas.controller.js');
  assert.match(view, /const canPlanMaterials = canMaterials && !isFinished && !linkedOrders\.length/);
  assert.match(view, /sol\.pode_editar_materiais_demanda/);
  assert.match(controller, /canAppendToRequest\(demanda, solicitacao, linkedOrders\)/);
});

test('runtime preserva cotação anterior, acrescenta item à mesma solicitação e bloqueia após OS', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-demand-materials-'));
  const dbPath = path.join(tempDir, 'runtime.db');
  const script = String.raw`
    const assert = require('node:assert/strict');
    const db = require('./database/db');

    db.exec(` + "`" + `
      CREATE TABLE demandas (
        id INTEGER PRIMARY KEY,
        status TEXT,
        updated_at TEXT
      );
      CREATE TABLE solicitacoes (
        id INTEGER PRIMARY KEY,
        numero TEXT,
        status TEXT,
        demanda_id INTEGER,
        os_id INTEGER,
        updated_at TEXT
      );
      CREATE TABLE estoque_itens (
        id INTEGER PRIMARY KEY,
        nome TEXT,
        ativo INTEGER DEFAULT 1
      );
      CREATE TABLE solicitacao_itens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        solicitacao_id INTEGER NOT NULL,
        item_nome TEXT,
        item_descricao TEXT,
        unidade TEXT,
        estoque_item_id INTEGER,
        qtd_solicitada REAL,
        item_id INTEGER,
        descricao TEXT,
        quantidade REAL,
        status_cotacao TEXT DEFAULT 'PENDENTE',
        status_compra TEXT DEFAULT 'PENDENTE',
        qtd_comprada REAL DEFAULT 0,
        qtd_recebida_total REAL DEFAULT 0,
        fornecedor_id INTEGER,
        valor_unitario_centavos INTEGER
      );
      CREATE TABLE os (
        id INTEGER PRIMARY KEY,
        demanda_id INTEGER,
        status TEXT
      );

      INSERT INTO demandas (id, status, updated_at) VALUES (5, 'PLANEJAMENTO', datetime('now'));
      INSERT INTO solicitacoes (id, numero, status, demanda_id, os_id, updated_at)
      VALUES (18, 'SOL-2026-000018', 'EM_COTACAO', 5, NULL, datetime('now'));
      INSERT INTO solicitacao_itens (
        solicitacao_id, item_nome, item_descricao, unidade, qtd_solicitada,
        descricao, quantidade, status_cotacao, status_compra, fornecedor_id, valor_unitario_centavos
      ) VALUES (18, 'Rolamento 22218', 'SKF', 'UN', 2, 'SKF', 2, 'COTADO', 'PENDENTE', 9, 12500);
    ` + "`" + `);

    const materials = require('./modules/demandas/demandas.materials.service');
    const result = materials.appendItems(5, 18, [{
      item_nome: 'Parafuso M16',
      item_descricao: 'Classe 8.8',
      unidade: 'UN',
      qtd_solicitada: 10,
      estoque_item_id: null,
    }]);

    assert.equal(result.totalAdicionado, 1);
    const rows = db.prepare('SELECT * FROM solicitacao_itens WHERE solicitacao_id=18 ORDER BY id').all();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].item_nome, 'Rolamento 22218');
    assert.equal(rows[0].status_cotacao, 'COTADO');
    assert.equal(rows[0].fornecedor_id, 9);
    assert.equal(rows[0].valor_unitario_centavos, 12500);
    assert.equal(rows[1].item_nome, 'Parafuso M16');
    assert.equal(rows[1].qtd_solicitada, 10);
    assert.equal(rows[1].status_cotacao, 'PENDENTE');
    assert.equal(rows[1].status_compra, 'PENDENTE');

    db.prepare("INSERT INTO os (id, demanda_id, status) VALUES (44, 5, 'ABERTA')").run();
    assert.throws(
      () => materials.appendItems(5, 18, [{ item_nome: 'Porca M16', unidade: 'UN', qtd_solicitada: 10 }]),
      error => error && error.code === 'DEMANDA_MATERIAIS_BLOQUEADOS_POR_OS'
    );

    process.stdout.write('ok');
  `;

  try {
    const output = execFileSync(process.execPath, ['-e', script], {
      cwd: root,
      env: { ...process.env, NODE_ENV: 'test', DB_PATH: dbPath },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.equal(output.trim(), 'ok');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
