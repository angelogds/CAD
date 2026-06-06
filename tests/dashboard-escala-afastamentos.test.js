const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const realLoad = Module._load;
Module._load = function mockOptionalPdfkit(request, parent, isMain) {
  if (request === 'pdfkit') {
    return class MockPDFDocument {
      pipe() {}
      fontSize() { return this; }
      text() { return this; }
      moveDown() { return this; }
      end() {}
    };
  }
  return realLoad.apply(this, arguments);
};

const tempDbPath = path.join(os.tmpdir(), `dashboard-escala-afastamentos-${process.pid}-${Date.now()}.sqlite`);
process.env.DB_PATH = tempDbPath;

const db = require('../database/db');
const dashboardService = require('../modules/dashboard/dashboard.service');

function resetSchema() {
  db.exec(`
    DROP TABLE IF EXISTS escala_concessoes;
    DROP TABLE IF EXISTS escala_ausencias;
    DROP TABLE IF EXISTS escala_alocacoes;
    DROP TABLE IF EXISTS escala_semanas;
    DROP TABLE IF EXISTS colaboradores;

    CREATE TABLE colaboradores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      funcao TEXT,
      ativo INTEGER DEFAULT 1
    );

    CREATE TABLE escala_semanas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      semana_numero INTEGER,
      data_inicio TEXT NOT NULL,
      data_fim TEXT NOT NULL
    );

    CREATE TABLE escala_alocacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      semana_id INTEGER NOT NULL,
      colaborador_id INTEGER NOT NULL,
      tipo_turno TEXT NOT NULL
    );

    CREATE TABLE escala_ausencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER NOT NULL,
      tipo TEXT,
      data_inicio TEXT NOT NULL,
      data_fim TEXT NOT NULL,
      motivo TEXT
    );

    CREATE TABLE escala_concessoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER NOT NULL,
      tipo TEXT,
      inicio TEXT NOT NULL,
      fim TEXT NOT NULL,
      concessao TEXT DEFAULT 'NAO_APLICA',
      motivo TEXT
    );
  `);

  db.prepare(`INSERT INTO escala_semanas (semana_numero, data_inicio, data_fim) VALUES (23, '2026-06-01', '2026-06-07')`).run();
}

function addColaborador(nome, tipoTurno = 'diurno', funcao = 'mecanico') {
  const info = db.prepare(`INSERT INTO colaboradores (nome, funcao, ativo) VALUES (?, ?, 1)`).run(nome, funcao);
  const id = Number(info.lastInsertRowid);
  db.prepare(`INSERT INTO escala_alocacoes (semana_id, colaborador_id, tipo_turno) VALUES (1, ?, ?)`).run(id, tipoTurno);
  return id;
}

function painelTexto(item) {
  return `${item.nome} — ${item.tipo} (${item.data_inicio} até ${item.data_fim})`;
}

test('Escala da Semana exibe férias, folga, atestado, meio período e desconhecido sem converter para FOLGA', () => {
  resetSchema();

  const rodolfo = addColaborador('Rodolfo');
  const emanuel = addColaborador('Emanuel');
  const maria = addColaborador('Maria');
  const luiz = addColaborador('Luiz');
  const desconhecido = addColaborador('Sem Tipo');
  const foraPeriodo = addColaborador('Fora do Período');

  db.prepare(`INSERT INTO escala_concessoes (colaborador_id, tipo, inicio, fim, concessao) VALUES (?, 'FERIAS', '2026-06-01', '2026-06-30', 'NAO_APLICA')`).run(rodolfo);
  db.prepare(`INSERT INTO escala_concessoes (colaborador_id, tipo, inicio, fim, concessao) VALUES (?, 'FOLGA', '2026-06-05', '2026-06-07', 'INTEIRA')`).run(emanuel);
  db.prepare(`INSERT INTO escala_concessoes (colaborador_id, tipo, inicio, fim, concessao) VALUES (?, 'ATESTADO', '2026-06-06', '2026-06-08', 'NAO_APLICA')`).run(maria);
  db.prepare(`INSERT INTO escala_concessoes (colaborador_id, tipo, inicio, fim, concessao) VALUES (?, 'FOLGA', '2026-06-06', '2026-06-07', 'MEIA')`).run(luiz);
  db.prepare(`INSERT INTO escala_concessoes (colaborador_id, tipo, inicio, fim, concessao) VALUES (?, '', '2026-06-06', '2026-06-06', 'NAO_APLICA')`).run(desconhecido);
  db.prepare(`INSERT INTO escala_concessoes (colaborador_id, tipo, inicio, fim, concessao) VALUES (?, 'FERIAS', '2026-07-01', '2026-07-30', 'NAO_APLICA')`).run(foraPeriodo);

  const escala = dashboardService.getEscalaPainelSemana({ dataReferencia: '2026-06-06' });
  const porNome = new Map((escala.folgas_afastamentos || []).map((item) => [item.nome, item]));

  assert.equal(escala.data_referencia, '2026-06-06');
  assert.equal(porNome.get('Rodolfo')?.tipo, 'FÉRIAS');
  assert.match(painelTexto(porNome.get('Rodolfo')), /Rodolfo — FÉRIAS \(2026-06-01 até 2026-06-30\)/);
  assert.doesNotMatch(painelTexto(porNome.get('Rodolfo')), /Rodolfo — FOLGA/);

  assert.equal(porNome.get('Emanuel')?.tipo, 'FOLGA');
  assert.equal(porNome.get('Maria')?.tipo, 'ATESTADO');
  assert.equal(porNome.get('Luiz')?.tipo, 'FOLGA MEIO PERÍODO');
  assert.equal(porNome.get('Sem Tipo')?.tipo, 'NÃO INFORMADO');
  assert.equal(porNome.has('Fora do Período'), false);

  assert.equal((escala.diurno_mecanicos || []).some((p) => p.nome === 'Rodolfo'), false);
});

test('formatarTipoAfastamento preserva tipos reais e nunca usa FOLGA como fallback genérico', () => {
  assert.equal(dashboardService.formatarTipoAfastamento('FERIAS'), 'FÉRIAS');
  assert.equal(dashboardService.formatarTipoAfastamento('FÉRIAS'), 'FÉRIAS');
  assert.equal(dashboardService.formatarTipoAfastamento('FOLGA_MEIO_PERIODO'), 'FOLGA MEIO PERÍODO');
  assert.equal(dashboardService.formatarTipoAfastamento('ATESTADO'), 'ATESTADO');
  assert.equal(dashboardService.formatarTipoAfastamento('TIPO_NOVO'), 'TIPO_NOVO');
  assert.equal(dashboardService.formatarTipoAfastamento(''), 'NÃO INFORMADO');
});

test('isRegistroAtivoNaData usa intervalo inclusivo de início e fim', () => {
  const registro = { inicio: '2026-06-01', fim: '2026-06-30' };
  assert.equal(dashboardService.isRegistroAtivoNaData(registro, '2026-06-01'), true);
  assert.equal(dashboardService.isRegistroAtivoNaData(registro, '2026-06-06'), true);
  assert.equal(dashboardService.isRegistroAtivoNaData(registro, '2026-06-30'), true);
  assert.equal(dashboardService.isRegistroAtivoNaData(registro, '2026-07-01'), false);
});
