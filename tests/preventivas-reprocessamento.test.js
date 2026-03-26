const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

const tempDbPath = path.join(os.tmpdir(), `preventivas-reprocessamento-${process.pid}-${Date.now()}.sqlite`);
process.env.DB_PATH = tempDbPath;

const db = require('../database/db');
const service = require('../modules/preventivas/preventivas.service');

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
    DROP TABLE IF EXISTS preventiva_execucoes;
    DROP TABLE IF EXISTS preventiva_planos;
    DROP TABLE IF EXISTS equipamentos;
    DROP TABLE IF EXISTS escala_alocacoes;
    DROP TABLE IF EXISTS escala_semanas;
    DROP TABLE IF EXISTS colaboradores;
    DROP TABLE IF EXISTS users;

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

    CREATE TABLE equipamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      tipo TEXT,
      criticidade TEXT,
      ativo INTEGER DEFAULT 1
    );

    CREATE TABLE preventiva_planos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipamento_id INTEGER,
      titulo TEXT,
      frequencia_tipo TEXT,
      frequencia_valor INTEGER,
      ativo INTEGER DEFAULT 1,
      tipo_plano TEXT,
      checklist_json TEXT,
      observacao TEXT
    );

    CREATE TABLE preventiva_execucoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plano_id INTEGER,
      data_prevista TEXT,
      status TEXT,
      responsavel TEXT,
      criticidade TEXT,
      responsavel_1_id INTEGER,
      responsavel_2_id INTEGER,
      observacao TEXT
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
  return { userId, colabId };
}

test('pré-validação confirma semana ativa, turnos e pendências elegíveis', () => {
  resetSchema();
  addColaborador({ nome: 'Diogo', funcao: 'mecanico', tipo_turno: 'diurno' });
  addColaborador({ nome: 'Junior', funcao: 'apoio', tipo_turno: 'apoio' });
  addColaborador({ nome: 'Rodolfo', funcao: 'mecanico', tipo_turno: 'plantao' });

  const eqId = Number(db.prepare(`INSERT INTO equipamentos (nome, tipo, criticidade, ativo) VALUES ('Redutor 01', 'redutor', 'ALTA', 1)`).run().lastInsertRowid);
  const planoId = Number(db.prepare(`INSERT INTO preventiva_planos (equipamento_id, titulo, frequencia_tipo, frequencia_valor, ativo) VALUES (?, 'Plano R1', 'semanal', 1, 1)`).run(eqId).lastInsertRowid);

  db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade) VALUES (?, date('now'), 'PENDENTE', '', 'ALTA')`).run(planoId);
  db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade) VALUES (?, date('now'), 'ATRASADA', '', 'ALTA')`).run(planoId);
  db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade) VALUES (?, date('now'), 'EM_ANDAMENTO', 'Equipe X', 'ALTA')`).run(planoId);

  const pre = service.prevalidarReprocessamentoPreventivas();
  assert.equal(pre.semanaAtiva, true);
  assert.equal(pre.colaboradoresTurno.diurno, 1);
  assert.equal(pre.colaboradoresTurno.apoio, 1);
  assert.equal(pre.colaboradoresTurno.noturnoPlantao, 1);
  assert.equal(pre.execucoesPendentes.pendente, 1);
  assert.equal(pre.execucoesPendentes.atrasada, 1);
  assert.equal(pre.execucoesPendentes.emAndamento, 1);
  assert.equal(pre.prontoParaReprocesso, true);
  assert.equal(pre.alertas.length, 0);
});

test('reprocesso atualiza atrasada e pendente, mas preserva em andamento já alocada', () => {
  resetSchema();
  const dia = addColaborador({ nome: 'Diogo', funcao: 'mecanico', tipo_turno: 'diurno' });
  addColaborador({ nome: 'Junior', funcao: 'operacional', tipo_turno: 'apoio' });
  addColaborador({ nome: 'Rodolfo', funcao: 'mecanico', tipo_turno: 'plantao' });

  const eqId = Number(db.prepare(`INSERT INTO equipamentos (nome, tipo, criticidade, ativo) VALUES ('Bomba 01', 'bomba', 'ALTA', 1)`).run().lastInsertRowid);
  const planoId = Number(db.prepare(`INSERT INTO preventiva_planos (equipamento_id, titulo, frequencia_tipo, frequencia_valor, ativo) VALUES (?, 'Plano B1', 'semanal', 1, 1)`).run(eqId).lastInsertRowid);

  const pendenteId = Number(db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade) VALUES (?, date('now'), 'PENDENTE', '', 'ALTA')`).run(planoId).lastInsertRowid);
  const atrasadaId = Number(db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade) VALUES (?, date('now','-1 day'), 'ATRASADA', '', 'ALTA')`).run(planoId).lastInsertRowid);
  const andamentoId = Number(db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade, responsavel_1_id) VALUES (?, date('now'), 'EM_ANDAMENTO', 'Equipe Legada', 'ALTA', ?)`).run(planoId, dia.userId).lastInsertRowid);

  withMockedSaoPauloTime(9, 15, () => {
    const result = service.reorganizarPreventivasPendentesPorEscala();
    assert.equal(result.totalAtivas, 3);
    assert.equal(result.atualizadas, 2);
  });

  const pendente = db.prepare(`SELECT responsavel, responsavel_1_id FROM preventiva_execucoes WHERE id = ?`).get(pendenteId);
  const atrasada = db.prepare(`SELECT responsavel, responsavel_1_id FROM preventiva_execucoes WHERE id = ?`).get(atrasadaId);
  const andamento = db.prepare(`SELECT responsavel, responsavel_1_id FROM preventiva_execucoes WHERE id = ?`).get(andamentoId);

  assert.notEqual(String(pendente.responsavel || '').trim(), '');
  assert.notEqual(String(atrasada.responsavel || '').trim(), '');
  assert.ok(Number(pendente.responsavel_1_id || 0) > 0);
  assert.ok(Number(atrasada.responsavel_1_id || 0) > 0);

  assert.equal(andamento.responsavel, 'Equipe Legada');
  assert.equal(Number(andamento.responsavel_1_id), dia.userId);
});
