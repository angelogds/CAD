const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

const tempDbPath = path.join(os.tmpdir(), `os-autoalocacao-${process.pid}-${Date.now()}.sqlite`);
process.env.DB_PATH = tempDbPath;

const db = require('../database/db');
const osService = require('../modules/os/os.service');

function withMockedSaoPauloTime(hour, minute, fn) {
  const RealDateTimeFormat = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function mockedDateTimeFormat() {
    return {
      formatToParts() {
        return [
          { type: 'hour', value: String(hour).padStart(2, '0') },
          { type: 'literal', value: ':' },
          { type: 'minute', value: String(minute).padStart(2, '0') },
        ];
      },
    };
  };

  try {
    return fn();
  } finally {
    Intl.DateTimeFormat = RealDateTimeFormat;
  }
}

function resetSchema() {
  db.exec(`
    DROP TABLE IF EXISTS os;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS colaboradores;
    DROP TABLE IF EXISTS escala_semanas;
    DROP TABLE IF EXISTS escala_alocacoes;

    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      ativo INTEGER DEFAULT 1
    );

    CREATE TABLE colaboradores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      funcao TEXT,
      user_id INTEGER,
      ativo INTEGER DEFAULT 1
    );

    CREATE TABLE escala_semanas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      semana_numero INTEGER,
      data_inicio TEXT,
      data_fim TEXT
    );

    CREATE TABLE escala_alocacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      semana_id INTEGER,
      colaborador_id INTEGER,
      tipo_turno TEXT
    );

    CREATE TABLE os (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grau TEXT,
      status TEXT,
      executor_colaborador_id INTEGER,
      auxiliar_colaborador_id INTEGER,
      mecanico_user_id INTEGER,
      auxiliar_user_id INTEGER,
      turno_alocado TEXT,
      alocacao_modo TEXT,
      alocado_em TEXT
    );
  `);

  db.prepare(`INSERT INTO escala_semanas (semana_numero, data_inicio, data_fim) VALUES (1, '2000-01-01', '2999-12-31')`).run();
}

function addColaborador({ nome, funcao, tipo_turno }) {
  const userInfo = db.prepare(`INSERT INTO users (name, ativo) VALUES (?, 1)`).run(nome);
  const userId = Number(userInfo.lastInsertRowid);
  const colabInfo = db.prepare(`INSERT INTO colaboradores (nome, funcao, user_id, ativo) VALUES (?, ?, ?, 1)`).run(nome, funcao, userId);
  const colabId = Number(colabInfo.lastInsertRowid);
  db.prepare(`INSERT INTO escala_alocacoes (semana_id, colaborador_id, tipo_turno) VALUES (1, ?, ?)`).run(colabId, tipo_turno);
  return { id: colabId, user_id: userId, nome, funcao, tipo_turno };
}

function addOS(grau = 'MEDIA') {
  const info = db.prepare(`INSERT INTO os (grau, status) VALUES (?, 'ABERTA')`).run(grau);
  return Number(info.lastInsertRowid);
}

test('Teste 1: DIA + BAIXA usa apoio disponível como executor', () => {
  resetSchema();
  const apoio = addColaborador({ nome: 'Junior', funcao: 'operacional', tipo_turno: 'apoio' });
  addColaborador({ nome: 'Diogo', funcao: 'mecanico', tipo_turno: 'diurno' });
  const osId = addOS('BAIXA');

  withMockedSaoPauloTime(7, 32, () => {
    const result = osService.autoAssignOS(osId);
    assert.equal(result.aguardando, false);
  });

  const osAlocada = osService.getOSById(osId);
  assert.equal(osAlocada.executor_colaborador_id, apoio.id);
  assert.equal(osAlocada.auxiliar_colaborador_id, null);
  assert.equal(osAlocada.turno_alocado, 'DIA');
  assert.equal(osAlocada.alocacao_modo, 'AUTO');
});

test('Teste 2: DIA + ALTA usa mecânico executor e apoio auxiliar', () => {
  resetSchema();
  const mecanico = addColaborador({ nome: 'Diogo', funcao: 'mecanico', tipo_turno: 'diurno' });
  const apoio = addColaborador({ nome: 'Junior', funcao: 'operacional', tipo_turno: 'apoio' });
  const osId = addOS('ALTA');

  withMockedSaoPauloTime(9, 10, () => {
    const result = osService.autoAssignOS(osId);
    assert.equal(result.aguardando, false);
  });

  const osAlocada = osService.getOSById(osId);
  assert.equal(osAlocada.executor_colaborador_id, mecanico.id);
  assert.equal(osAlocada.auxiliar_colaborador_id, apoio.id);
  assert.equal(osAlocada.turno_alocado, 'DIA');
  assert.equal(osAlocada.alocacao_modo, 'AUTO');
});

test('Teste 3: NOITE usa plantonista mecânico (Rodolfo) como único responsável', () => {
  resetSchema();
  const rodolfo = addColaborador({ nome: 'Rodolfo', funcao: 'mecanico', tipo_turno: 'plantao' });
  addColaborador({ nome: 'Backup Noturno', funcao: 'mecanico', tipo_turno: 'noturno' });
  const osId = addOS('MEDIA');

  withMockedSaoPauloTime(23, 10, () => {
    const result = osService.autoAssignOS(osId);
    assert.equal(result.aguardando, false);
  });

  const osAlocada = osService.getOSById(osId);
  assert.equal(osAlocada.executor_colaborador_id, rodolfo.id);
  assert.equal(osAlocada.auxiliar_colaborador_id, null);
  assert.equal(osAlocada.turno_alocado, 'NOITE');
  assert.equal(osAlocada.alocacao_modo, 'AUTO');
});

test('Teste 4: colaborador já em OS ativa não pode ser realocado', () => {
  resetSchema();
  const apoio = addColaborador({ nome: 'Junior', funcao: 'operacional', tipo_turno: 'apoio' });
  const mecanico = addColaborador({ nome: 'Diogo', funcao: 'mecanico', tipo_turno: 'diurno' });

  const osAtiva = addOS('BAIXA');
  db.prepare(`UPDATE os SET status='ANDAMENTO', executor_colaborador_id=? WHERE id=?`).run(apoio.id, osAtiva);

  const osNova = addOS('BAIXA');
  withMockedSaoPauloTime(8, 15, () => {
    const result = osService.autoAssignOS(osNova);
    assert.equal(result.aguardando, false);
  });

  const osAlocada = osService.getOSById(osNova);
  assert.equal(osAlocada.executor_colaborador_id, mecanico.id);
  assert.notEqual(osAlocada.executor_colaborador_id, apoio.id);
});
