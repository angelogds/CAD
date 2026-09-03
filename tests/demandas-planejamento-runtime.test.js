const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

test('migration 188 executa sobre SQLite real sem perder demandas existentes', () => {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE demandas (
      id INTEGER PRIMARY KEY,
      titulo TEXT NOT NULL,
      descricao TEXT,
      prioridade TEXT,
      status TEXT
    );
    CREATE TABLE os (
      id INTEGER PRIMARY KEY,
      descricao TEXT
    );
    INSERT INTO demandas (id, titulo, descricao, prioridade, status)
    VALUES (7, 'Reforma Caldeira 1', 'Registro histórico existente', 'ALTA', 'NOVA');
  `);

  const tableExists = name => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
  const columnExists = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column);
  const addColumnIfMissing = (table, column, definition) => {
    if (!columnExists(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  };

  require('../database/migrations/188_demandas_planejamento_integrado')({
    db,
    tableExists,
    columnExists,
    addColumnIfMissing,
  });

  const preserved = db.prepare('SELECT * FROM demandas WHERE id = 7').get();
  assert.equal(preserved.titulo, 'Reforma Caldeira 1');
  assert.equal(preserved.descricao, 'Registro histórico existente');
  assert.equal(preserved.categoria, 'MANUTENCAO');
  assert.equal(preserved.aprovacao_status, 'PENDENTE');
  assert.equal(preserved.custo_servicos_estimado, 0);

  for (const column of ['demanda_pai_id', 'equipamento_id', 'categoria', 'setor_origem', 'nr_referencia', 'prazo_previsto', 'custo_servicos_estimado', 'aprovacao_status']) {
    assert.equal(columnExists('demandas', column), true, `coluna ${column} deveria existir`);
  }
  assert.equal(columnExists('os', 'demanda_id'), true);

  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(row => row.name);
  assert.ok(indexes.includes('idx_demandas_pai'));
  assert.ok(indexes.includes('idx_demandas_equipamento'));
  assert.ok(indexes.includes('idx_demandas_categoria'));
  assert.ok(indexes.includes('idx_os_demanda_id'));
});

test('pré-cotação usa dados reais e bloqueia compra até existir OS', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-demandas-gate-'));
  const dbPath = path.join(tempDir, 'runtime.db');
  const script = String.raw`
    const assert = require('node:assert/strict');
    const db = require('./database/db');

    db.exec(` + "`" + `
      CREATE TABLE demandas (
        id INTEGER PRIMARY KEY,
        titulo TEXT,
        status TEXT,
        prioridade TEXT,
        aprovacao_status TEXT,
        prazo_previsto TEXT,
        nr_referencia TEXT,
        equipamento_id INTEGER
      );
      CREATE TABLE equipamentos (id INTEGER PRIMARY KEY, nome TEXT);
      CREATE TABLE solicitacoes (
        id INTEGER PRIMARY KEY,
        numero TEXT,
        titulo TEXT,
        status TEXT,
        prioridade TEXT,
        created_at TEXT,
        updated_at TEXT,
        demanda_id INTEGER,
        os_id INTEGER,
        disponivel_compras INTEGER
      );
      CREATE TABLE solicitacao_itens (
        id INTEGER PRIMARY KEY,
        solicitacao_id INTEGER,
        status_cotacao TEXT,
        status_compra TEXT
      );

      INSERT INTO equipamentos (id, nome) VALUES (3, 'Caldeira 1');
      INSERT INTO demandas (id, titulo, status, prioridade, aprovacao_status, prazo_previsto, nr_referencia, equipamento_id)
      VALUES (11, 'Reforma da Caldeira 1', 'PLANEJAMENTO', 'ALTA', 'PENDENTE', '2026-09-10', 'NR-13', 3);
      INSERT INTO solicitacoes (id, numero, titulo, status, prioridade, created_at, updated_at, demanda_id, os_id, disponivel_compras)
      VALUES (21, 'SOL-2026-000021', 'Materiais da reforma', 'ABERTA', 'ALTA', datetime('now'), datetime('now'), 11, NULL, 1);
      INSERT INTO solicitacao_itens (id, solicitacao_id, status_cotacao, status_compra) VALUES
        (31, 21, 'COTADO', 'PENDENTE'),
        (32, 21, 'PENDENTE', 'PENDENTE');
    ` + "`" + `);

    const service = require('./modules/compras/compras-demandas.service');
    const rows = service.listPreCotacoesDemandas(12);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].demanda_titulo, 'Reforma da Caldeira 1');
    assert.equal(rows[0].equipamento_nome, 'Caldeira 1');
    assert.equal(Number(rows[0].itens_count), 2);
    assert.equal(Number(rows[0].itens_cotados), 1);
    assert.equal(Number(rows[0].itens_comprados), 0);

    assert.throws(
      () => service.assertCompraLiberada(21),
      error => error && error.code === 'DEMANDA_PRE_COTACAO_AGUARDANDO_OS'
    );

    db.prepare('UPDATE solicitacoes SET os_id = ? WHERE id = ?').run(900, 21);
    assert.doesNotThrow(() => service.assertCompraLiberada(21));
    assert.equal(service.listPreCotacoesDemandas(12).length, 0);
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

test('RBAC real separa consulta, planejamento, conversão e aprovação de demandas', () => {
  const { canAccessModule } = require('../config/rbac');

  const expected = {
    ADMIN: { view: true, open: true, manage: true, materials: true, convert: true, approve: true },
    DIRETORIA: { view: true, open: true, manage: true, materials: false, convert: false, approve: true },
    // GESTAO participa da origem/aprovação da demanda, mas não altera o planejamento técnico.
    GESTAO: { view: true, open: true, manage: false, materials: false, convert: false, approve: true },
    RH: { view: true, open: true, manage: false, materials: false, convert: false, approve: false },
    ENCARREGADO_PRODUCAO: { view: true, open: true, manage: false, materials: false, convert: false, approve: false },
    MANUTENCAO_SUPERVISOR: { view: true, open: true, manage: true, materials: true, convert: true, approve: false },
    ENCARREGADO_MANUTENCAO: { view: true, open: true, manage: true, materials: true, convert: true, approve: false },
    COMPRAS: { view: true, open: false, manage: false, materials: false, convert: false, approve: false },
  };

  const keys = {
    view: 'demandas_view',
    open: 'demandas_open',
    manage: 'demandas_manage',
    materials: 'demandas_materials',
    convert: 'demandas_convert',
    approve: 'demandas_approve',
  };

  for (const [role, permissions] of Object.entries(expected)) {
    for (const [permission, allowed] of Object.entries(permissions)) {
      assert.equal(
        canAccessModule(role, keys[permission]),
        allowed,
        `${role} / ${permission} deveria ser ${allowed}`
      );
    }
  }
});
