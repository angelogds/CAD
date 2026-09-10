const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

test('painel lista somente demandas principais e mantém subdemandas dentro do pai por criticidade', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-demandas-hierarquia-'));
  const dbPath = path.join(tempDir, 'runtime.db');

  const script = String.raw`
    const assert = require('node:assert/strict');
    const db = require('./database/db');

    db.exec(` + "`" + `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT,
        role TEXT,
        ativo INTEGER DEFAULT 1
      );
      CREATE TABLE equipamentos (
        id INTEGER PRIMARY KEY,
        nome TEXT
      );
      CREATE TABLE demandas (
        id INTEGER PRIMARY KEY,
        titulo TEXT NOT NULL,
        descricao TEXT,
        prioridade TEXT,
        status TEXT,
        created_by INTEGER,
        responsavel_user_id INTEGER,
        demanda_pai_id INTEGER,
        equipamento_id INTEGER,
        categoria TEXT,
        setor_origem TEXT,
        nr_referencia TEXT,
        prazo_previsto TEXT,
        custo_servicos_estimado REAL DEFAULT 0,
        aprovacao_status TEXT,
        ultima_atualizacao TEXT,
        started_at TEXT,
        finished_at TEXT,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE demanda_logs (
        id INTEGER PRIMARY KEY,
        demanda_id INTEGER,
        user_id INTEGER,
        texto TEXT,
        created_at TEXT
      );
      CREATE TABLE solicitacoes (
        id INTEGER PRIMARY KEY,
        numero TEXT,
        titulo TEXT,
        status TEXT,
        os_id INTEGER,
        demanda_id INTEGER,
        created_at TEXT
      );
      CREATE TABLE solicitacao_itens (
        id INTEGER PRIMARY KEY,
        solicitacao_id INTEGER,
        status_cotacao TEXT
      );
      CREATE TABLE os (
        id INTEGER PRIMARY KEY,
        demanda_id INTEGER,
        status TEXT,
        tipo TEXT,
        descricao TEXT,
        opened_at TEXT,
        closed_at TEXT
      );

      INSERT INTO users (id, name, role, ativo) VALUES (1, 'Administrador', 'ADMIN', 1);
      INSERT INTO equipamentos (id, nome) VALUES (1, 'Triturador FAST');

      INSERT INTO demandas (
        id, titulo, descricao, prioridade, status, created_by, demanda_pai_id,
        equipamento_id, categoria, aprovacao_status, created_at, updated_at
      ) VALUES
        (10, 'Reforma do triturador', 'Demanda principal', 'ALTA', 'NOVA', 1, NULL, 1, 'MANUTENCAO', 'PENDENTE', datetime('now'), datetime('now')),
        (11, 'Trocar dentes', 'Subdemanda crítica', 'URGENTE', 'NOVA', 1, 10, 1, 'MANUTENCAO', 'PENDENTE', datetime('now'), datetime('now')),
        (12, 'Pintura final', 'Subdemanda baixa', 'BAIXA', 'NOVA', 1, 10, 1, 'MANUTENCAO', 'PENDENTE', datetime('now'), datetime('now')),
        (20, 'Revisão do moinho', 'Outra demanda principal', 'NORMAL', 'EM_ANALISE', 1, NULL, 1, 'MANUTENCAO', 'PENDENTE', datetime('now'), datetime('now'));
    ` + "`" + `);

    const service = require('./modules/demandas/demandas.service');
    const user = { id: 1, role: 'ADMIN' };

    const principais = service.list({ tab: 'TODAS', limit: 50 }, user);
    assert.deepEqual(principais.map(item => Number(item.id)), [10, 20]);
    assert.equal(principais.some(item => item.demanda_pai_id), false);
    assert.equal(Number(principais[0].subdemandas_count), 2);

    const painel = service.getPainel(user);
    assert.equal(painel.total, 2);
    assert.equal(painel.ativas, 2);
    assert.equal(painel.prioritarias, 1, 'subdemanda crítica não deve inflar o indicador da fila principal');

    const detalhe = service.getById(10);
    assert.deepEqual(
      detalhe.subdemandas.map(item => Number(item.id)),
      [11, 12],
      'subdemandas devem permanecer no detalhe e ser ordenadas por criticidade'
    );

    const pais = service.listParentCandidates(user);
    assert.deepEqual(pais.map(item => Number(item.id)), [20, 10]);

    const buscaPorSubdemanda = service.list({ tab: 'TODAS', q: 'Trocar dentes', limit: 50 }, user);
    assert.deepEqual(buscaPorSubdemanda.map(item => Number(item.id)), [10]);

    const resumo = service.getResumoDashboard();
    assert.equal(resumo.novas, 1);
    assert.equal(resumo.em_andamento, 0);
    assert.equal(resumo.paradas, 0);

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

test('serviço mantém regra explícita de fila principal e ordenação das subdemandas', () => {
  const service = fs.readFileSync(path.join(root, 'modules/demandas/demandas.service.js'), 'utf8');

  assert.match(service, /d\.demanda_pai_id IS NULL/);
  assert.match(service, /sd_busca\.demanda_pai_id = d\.id/);
  assert.match(service, /WHEN 'URGENTE' THEN 0/);
  assert.match(service, /WHEN 'ALTA' THEN 1/);
  assert.match(service, /WHEN 'NORMAL' THEN 2/);
  assert.match(service, /WHEN 'BAIXA' THEN 3/);
});
