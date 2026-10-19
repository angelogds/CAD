const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

// Executado em processo isolado, sem abrir o banco da aplicação ou dados reais.
function checkOverdueFilter() {
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const { DatabaseSync } = require('node:sqlite');
  const ejs = require('ejs');
  const db = new DatabaseSync(':memory:');
  const dbModule = require.resolve('./database/db');
  require.cache[dbModule] = { id: dbModule, filename: dbModule, loaded: true, exports: db };

  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, role TEXT, ativo INTEGER);
    CREATE TABLE equipamentos (id INTEGER PRIMARY KEY, nome TEXT);
    CREATE TABLE demandas (
      id INTEGER PRIMARY KEY, titulo TEXT, descricao TEXT, prioridade TEXT, status TEXT,
      created_by INTEGER, responsavel_user_id INTEGER, demanda_pai_id INTEGER,
      equipamento_id INTEGER, categoria TEXT, nr_referencia TEXT, prazo_previsto TEXT,
      ultima_atualizacao TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE demanda_logs (demanda_id INTEGER, created_at TEXT);
    CREATE TABLE solicitacoes (id INTEGER PRIMARY KEY, demanda_id INTEGER);
    CREATE TABLE os (id INTEGER PRIMARY KEY, demanda_id INTEGER);
    INSERT INTO users VALUES (1, 'Criador', 'ADMIN', 1), (2, 'Responsável', 'RH', 1);
    INSERT INTO equipamentos VALUES (1, 'Equipamento de teste');
    INSERT INTO demandas
      (id, titulo, prioridade, status, created_by, responsavel_user_id,
       equipamento_id, prazo_previsto, created_at, updated_at)
    VALUES
      (1, 'Motor atrasado', 'ALTA', 'NOVA', 1, 2, 1, date('now', '-1 day'), datetime('now'), datetime('now')),
      (2, 'Análise atrasada', 'NORMAL', 'EM_ANALISE', 1, 1, 1, date('now', '-2 days'), datetime('now'), datetime('now')),
      (3, 'Planejamento atrasado', 'NORMAL', 'PLANEJAMENTO', 1, 1, 1, date('now', '-2 days'), datetime('now'), datetime('now')),
      (4, 'Aprovação atrasada', 'NORMAL', 'AGUARDANDO_APROVACAO', 1, 1, 1, date('now', '-2 days'), datetime('now'), datetime('now')),
      (5, 'Execução atrasada', 'NORMAL', 'EM_ANDAMENTO', 1, 1, 1, date('now', '-2 days'), datetime('now'), datetime('now')),
      (6, 'Parada atrasada', 'NORMAL', 'PARADA', 1, 1, 1, datetime('now', '-1 day'), datetime('now'), datetime('now')),
      (20, 'Vence hoje', 'NORMAL', 'NOVA', 1, 1, 1, date('now'), datetime('now'), datetime('now')),
      (21, 'Sem prazo', 'NORMAL', 'NOVA', 1, 1, 1, NULL, datetime('now'), datetime('now')),
      (22, 'Prazo vazio', 'NORMAL', 'NOVA', 1, 1, 1, '   ', datetime('now'), datetime('now')),
      (23, 'Prazo inválido', 'NORMAL', 'NOVA', 1, 1, 1, 'invalido', datetime('now'), datetime('now')),
      (24, 'Concluída', 'NORMAL', 'CONCLUIDA', 1, 1, 1, date('now', '-2 days'), datetime('now'), datetime('now')),
      (25, 'Cancelada', 'NORMAL', 'CANCELADA', 1, 1, 1, date('now', '-2 days'), datetime('now'), datetime('now'));
    INSERT INTO demandas (id, titulo, prioridade, status, created_by, demanda_pai_id, prazo_previsto, created_at, updated_at)
    VALUES (26, 'Subdemanda vencida', 'URGENTE', 'NOVA', 1, 20, date('now', '-2 days'), datetime('now'), datetime('now'));
    WITH RECURSIVE numeros(id) AS (SELECT 100 UNION ALL SELECT id + 1 FROM numeros WHERE id < 119)
    INSERT INTO demandas (id, titulo, prioridade, status, created_by, prazo_previsto, created_at, updated_at)
    SELECT id, 'Futura ' || id, 'URGENTE', 'NOVA', 1, date('now', '+1 day'), datetime('now'), datetime('now') FROM numeros;
  `);

  const service = require('./modules/demandas/demandas.service');
  const controller = require('./modules/demandas/demandas.controller');
  const { normalizeRole, canAccessModule } = require('./config/rbac');
  const admin = { id: 1, role: 'ADMIN' };
  const overdue = { tab: 'ATIVAS', prazo_vencido: '1', limit: 50 };
  const ids = (filters, user = admin) => service.list(filters, user).map(row => row.id).sort((a, b) => a - b);

  assert.deepEqual(ids(overdue), [1, 2, 3, 4, 5, 6]);
  assert.equal(service.getPainel(admin).prazos_atrasados, 6, 'lista e indicador devem usar a mesma regra');
  assert.deepEqual(ids({ ...overdue, limit: 10 }), [1, 2, 3, 4, 5, 6], 'filtrar antes do limite, mesmo com 20 futuras de maior prioridade');
  assert.deepEqual(ids({ ...overdue, tab: 'TODAS' }), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(ids({ ...overdue, tab: 'HISTORICO' }), []);
  assert.deepEqual(ids({ ...overdue, status: 'CONCLUIDA' }), []);
  assert.deepEqual(ids({ ...overdue, q: 'Motor', prioridade: 'ALTA', responsavel_user_id: '2', status: 'NOVA' }), [1]);
  assert.deepEqual(ids({ ...overdue, q: 'Subdemanda vencida' }), [], 'busca pela subdemanda não deve incluir pai sem atraso');
  assert.deepEqual(ids(overdue, { id: 999, role: 'RH' }), [1, 2, 3, 4, 5, 6], 'preservar lista global autorizada');
  assert.deepEqual(ids(overdue, { id: 999, role: 'SEM_PERMISSAO' }), [], 'preservar RBAC');
  for (const value of ['', '0', 'false', 'qualquer', "1 OR 1=1"]) {
    assert.deepEqual(ids({ ...overdue, prazo_vencido: value }), ids({ tab: 'ATIVAS', limit: 50 }));
  }

  const renderIndex = query => {
    let rendered;
    controller.index({ query, session: { user: admin } }, {
      render(name, locals) {
        assert.equal(name, 'demandas/index');
        rendered = locals;
      },
    });
    return rendered;
  };
  const locals = renderIndex({ prazo_vencido: '1', q: 'Motor', responsavel_user_id: '2', limit: '50' });
  assert.equal(locals.filters.prazo_vencido, '1');
  assert.deepEqual(locals.lista.map(row => row.id), [1], 'controller deve encaminhar filtro à consulta');
  const html = ejs.render(fs.readFileSync('views/demandas/index.ejs', 'utf8'), {
    ...locals, user: admin, normalizeRole, canAccessModule, layout() {}, fmtBR: value => value || '',
  });
  assert.match(html, /name="prazo_vencido" value="1"/, 'formulário deve manter o filtro ao aplicar busca/status/prioridade');
  assert.match(html, /Prazo vencido \(ativas\)/, 'filtro ativo deve ficar visível');

  const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map(match => ({ url: new URL(match[1].replace(/&amp;/g, '&'), 'https://example.test'), text: match[2] }));
  const overdueLink = links.find(link => link.text.includes('>Prazo vencido</span>'));
  assert.ok(overdueLink);
  assert.equal(overdueLink.url.searchParams.get('prazo_vencido'), '1');
  assert.equal(overdueLink.url.searchParams.get('tab'), 'ATIVAS');
  assert.equal(overdueLink.url.searchParams.get('q'), 'Motor');
  assert.equal(overdueLink.url.searchParams.get('responsavel_user_id'), '2');
  assert.equal(overdueLink.url.searchParams.get('limit'), '50');
  assert.deepEqual(renderIndex(Object.fromEntries(overdueLink.url.searchParams)).lista.map(row => row.id), [1]);

  const removeLink = links.find(link => link.text === 'Remover filtro de prazo');
  assert.ok(removeLink);
  assert.equal(removeLink.url.searchParams.has('prazo_vencido'), false);
  assert.equal(removeLink.url.searchParams.get('q'), 'Motor');
  assert.equal(removeLink.url.searchParams.get('responsavel_user_id'), '2');
  for (const link of links.filter(link => link.text.includes('metric-label') && link !== overdueLink)) {
    assert.equal(link.url.searchParams.has('prazo_vencido'), false, 'outros indicadores devem sair do recorte de atraso');
  }
  const historyLink = links.find(link => link.text.includes('Concluídas e histórico'));
  assert.equal(historyLink.url.searchParams.has('prazo_vencido'), false, 'histórico não deve herdar filtro exclusivo de ativas');
  for (const value of ['0', 'false', 'qualquer']) {
    assert.equal(renderIndex({ prazo_vencido: value }).filters.prazo_vencido, '');
  }
  db.close();
  process.stdout.write('ok');
}

test('Prazo vencido filtra SQLite real e mantém o estado entre indicador, controller e view EJS', () => {
  const output = execFileSync(process.execPath, ['-e', `(${checkOverdueFilter.toString()})()`], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'test' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(output, 'ok');
});
