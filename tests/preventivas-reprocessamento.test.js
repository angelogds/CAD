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
          { type: 'year', value: '2026' },
          { type: 'literal', value: '-' },
          { type: 'month', value: '03' },
          { type: 'literal', value: '-' },
          { type: 'day', value: '28' },
          { type: 'literal', value: ' ' },
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
      setor TEXT,
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

function addColaboradorSemUser({ nome, funcao, tipo_turno }) {
  const colabInfo = db.prepare(`INSERT INTO colaboradores (nome, funcao, user_id, ativo) VALUES (?, ?, NULL, 1)`).run(nome, funcao);
  const colabId = Number(colabInfo.lastInsertRowid);
  db.prepare(`INSERT INTO escala_alocacoes (semana_id, colaborador_id, tipo_turno) VALUES (1, ?, ?)`).run(colabId, tipo_turno);
  return { userId: null, colabId };
}

test('pré-validação confirma semana ativa, turnos e pendências elegíveis', () => {
  resetSchema();
  addColaborador({ nome: 'Diogo', funcao: 'mecanico', tipo_turno: 'diurno' });
  addColaborador({ nome: 'Junior', funcao: 'apoio', tipo_turno: 'apoio' });
  const rodolfo = addColaborador({ nome: 'Rodolfo', funcao: 'mecanico', tipo_turno: 'plantao' });

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

test('reprocesso atualiza apenas pendente e preserva atrasada/em andamento', () => {
  resetSchema();
  const dia = addColaborador({ nome: 'Diogo', funcao: 'mecanico', tipo_turno: 'diurno' });
  addColaborador({ nome: 'Junior', funcao: 'operacional', tipo_turno: 'apoio' });
  const rodolfo = addColaborador({ nome: 'Rodolfo', funcao: 'mecanico', tipo_turno: 'plantao' });

  const eqId = Number(db.prepare(`INSERT INTO equipamentos (nome, tipo, criticidade, ativo) VALUES ('Bomba 01', 'bomba', 'ALTA', 1)`).run().lastInsertRowid);
  const planoId = Number(db.prepare(`INSERT INTO preventiva_planos (equipamento_id, titulo, frequencia_tipo, frequencia_valor, ativo) VALUES (?, 'Plano B1', 'semanal', 1, 1)`).run(eqId).lastInsertRowid);

  const pendenteId = Number(db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade) VALUES (?, date('now'), 'PENDENTE', '', 'ALTA')`).run(planoId).lastInsertRowid);
  const atrasadaId = Number(db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade) VALUES (?, date('now','-1 day'), 'ATRASADA', '', 'ALTA')`).run(planoId).lastInsertRowid);
  const andamentoId = Number(db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade, responsavel_1_id) VALUES (?, date('now'), 'EM_ANDAMENTO', 'Equipe Legada', 'ALTA', ?)`).run(planoId, dia.userId).lastInsertRowid);

  withMockedSaoPauloTime(9, 15, () => {
    const result = service.reorganizarPreventivasPendentesPorEscala();
    assert.equal(result.totalAtivas, 2);
    assert.equal(result.atualizadas, 2);
  });

  const pendente = db.prepare(`SELECT responsavel, responsavel_1_id FROM preventiva_execucoes WHERE id = ?`).get(pendenteId);
  const atrasada = db.prepare(`SELECT responsavel, responsavel_1_id FROM preventiva_execucoes WHERE id = ?`).get(atrasadaId);
  const andamento = db.prepare(`SELECT responsavel, responsavel_1_id FROM preventiva_execucoes WHERE id = ?`).get(andamentoId);

  assert.notEqual(String(pendente.responsavel || '').trim(), '');
  assert.ok(Number(pendente.responsavel_1_id || 0) > 0);
  assert.notEqual(String(atrasada.responsavel || '').trim(), '');
  assert.ok(Number(atrasada.responsavel_1_id || 0) > 0);

  assert.equal(andamento.responsavel, 'Equipe Legada');
  assert.equal(Number(andamento.responsavel_1_id), dia.userId);
});

test('reprocesso não quebra em schema legado sem equipamentos.codigo/checklist_json', () => {
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
      setor TEXT,
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
      responsavel_2_id INTEGER
    );
  `);

  db.prepare(`INSERT INTO escala_semanas (semana_numero, data_inicio, data_fim) VALUES (1, '2000-01-01', '2999-12-31')`).run();
  const userId = Number(db.prepare(`INSERT INTO users (name, ativo) VALUES ('Diogo', 1)`).run().lastInsertRowid);
  const colabId = Number(db.prepare(`INSERT INTO colaboradores (nome, funcao, user_id, ativo) VALUES ('Diogo', 'mecanico', ?, 1)`).run(userId).lastInsertRowid);
  db.prepare(`INSERT INTO escala_alocacoes (semana_id, colaborador_id, tipo_turno) VALUES (1, ?, 'diurno')`).run(colabId);

  const eqId = Number(db.prepare(`INSERT INTO equipamentos (nome, tipo, criticidade, ativo) VALUES ('Bomba 01', 'bomba', 'ALTA', 1)`).run().lastInsertRowid);
  const planoId = Number(db.prepare(`INSERT INTO preventiva_planos (equipamento_id, titulo, frequencia_tipo, frequencia_valor, ativo, observacao) VALUES (?, 'Plano legado', 'semanal', 1, 1, '')`).run(eqId).lastInsertRowid);
  db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade) VALUES (?, date('now'), 'PENDENTE', '', 'ALTA')`).run(planoId);

  assert.doesNotThrow(() => service.reprocessarModuloPreventivas({ user: { id: 999, name: 'Teste' } }));
});

test('alocação salva IDs de usuário mesmo quando OS retorna colaborador.id', () => {
  resetSchema();
  const executor = addColaborador({ nome: 'Diogo', funcao: 'mecanico', tipo_turno: 'diurno' });
  const auxiliar = addColaborador({ nome: 'Junior', funcao: 'apoio', tipo_turno: 'apoio' });

  const osService = require('../modules/os/os.service');
  const original = osService.resolverEquipePorCriticidade;
  osService.resolverEquipePorCriticidade = () => ({
    executor: { id: executor.colabId, nome: 'Diogo' },
    auxiliar: { id: auxiliar.colabId, nome: 'Junior' },
  });

  try {
    const eqId = Number(db.prepare(`INSERT INTO equipamentos (nome, tipo, criticidade, ativo) VALUES ('Bomba 01', 'bomba', 'ALTA', 1)`).run().lastInsertRowid);
    const planoId = Number(db.prepare(`INSERT INTO preventiva_planos (equipamento_id, titulo, frequencia_tipo, frequencia_valor, ativo) VALUES (?, 'Plano B1', 'semanal', 1, 1)`).run(eqId).lastInsertRowid);
    const execId = Number(db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade) VALUES (?, date('now'), 'PENDENTE', '', 'ALTA')`).run(planoId).lastInsertRowid);

    withMockedSaoPauloTime(9, 15, () => service.alocarEquipeExecucaoPreventiva(execId));
    const row = db.prepare(`SELECT responsavel_1_id, responsavel_2_id FROM preventiva_execucoes WHERE id = ?`).get(execId);
    assert.equal(Number(row.responsavel_1_id), executor.userId);
    assert.equal(Number(row.responsavel_2_id), auxiliar.userId);
  } finally {
    osService.resolverEquipePorCriticidade = original;
  }
});

test('reprocesso usa apenas equipe vigente da escala sem puxar usuário fora da escala', () => {
  resetSchema();
  const a = addColaborador({ nome: 'Diogo', funcao: 'mecanico', tipo_turno: 'diurno' });
  const b = addColaborador({ nome: 'Salviano', funcao: 'mecanico', tipo_turno: 'diurno' });
  const c = addColaborador({ nome: 'Viano', funcao: 'mecanico', tipo_turno: 'diurno' });
  const rodolfo = addColaborador({ nome: 'Rodolfo', funcao: 'mecanico', tipo_turno: 'plantao' });

  const userForaEscala = Number(db.prepare(`INSERT INTO users (name, ativo) VALUES ('Mecanico Fora Escala', 1)`).run().lastInsertRowid);
  db.prepare(`INSERT INTO colaboradores (nome, funcao, user_id, ativo) VALUES ('Mecanico Fora Escala', 'mecanico', ?, 1)`).run(userForaEscala);

  const eqA = Number(db.prepare(`INSERT INTO equipamentos (nome, tipo, criticidade, ativo) VALUES ('Exaustor A', 'exaustor', 'BAIXA', 1)`).run().lastInsertRowid);
  const eqB = Number(db.prepare(`INSERT INTO equipamentos (nome, tipo, criticidade, ativo) VALUES ('Bomba B', 'bomba', 'BAIXA', 1)`).run().lastInsertRowid);
  const planoA = Number(db.prepare(`INSERT INTO preventiva_planos (equipamento_id, titulo, frequencia_tipo, frequencia_valor, ativo) VALUES (?, 'Plano EXA', 'semanal', 1, 1)`).run(eqA).lastInsertRowid);
  const planoB = Number(db.prepare(`INSERT INTO preventiva_planos (equipamento_id, titulo, frequencia_tipo, frequencia_valor, ativo) VALUES (?, 'Plano BOM', 'semanal', 1, 1)`).run(eqB).lastInsertRowid);

  for (let i = 0; i < 6; i += 1) {
    db.prepare(`
      INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade)
      VALUES (?, date('now', ?), 'PENDENTE', '', 'BAIXA')
    `).run(i % 2 === 0 ? planoA : planoB, `+${i} day`);
  }

  withMockedSaoPauloTime(10, 0, () => {
    const result = service.reorganizarPreventivasPendentesPorEscala();
    assert.equal(result.totalAtivas, 6);
    assert.equal(result.atualizadas, 6);
  });

  const rows = db.prepare(`
    SELECT responsavel, responsavel_1_id
    FROM preventiva_execucoes
    ORDER BY id ASC
  `).all();
  const idsAtribuidos = rows.map((r) => Number(r.responsavel_1_id || 0));
  const universoEscala = new Set([a.userId, b.userId, c.userId, rodolfo.userId]);
  idsAtribuidos.forEach((id) => assert.ok(universoEscala.has(id)));
  assert.ok(new Set(idsAtribuidos).size >= 2);
  assert.ok(!idsAtribuidos.includes(userForaEscala));
});

test('turno noturno atribui preventivas pendentes somente ao plantonista', () => {
  resetSchema();
  const diogo = addColaborador({ nome: 'Diogo', funcao: 'mecanico', tipo_turno: 'diurno' });
  addColaborador({ nome: 'Emanuel', funcao: 'apoio', tipo_turno: 'apoio' });
  const rodolfo = addColaborador({ nome: 'Rodolfo', funcao: 'mecanico', tipo_turno: 'plantao' });

  const eqId = Number(db.prepare(`INSERT INTO equipamentos (nome, tipo, criticidade, ativo) VALUES ('Caldeira Exaustor 01', 'exaustor', 'CRITICA', 1)`).run().lastInsertRowid);
  const planoId = Number(db.prepare(`INSERT INTO preventiva_planos (equipamento_id, titulo, frequencia_tipo, frequencia_valor, ativo) VALUES (?, 'Plano noturno', 'semanal', 1, 1)`).run(eqId).lastInsertRowid);
  db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade) VALUES (?, date('now'), 'PENDENTE', '', 'CRITICA')`).run(planoId);
  db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade) VALUES (?, date('now'), 'PENDENTE', '', 'BAIXA')`).run(planoId);

  withMockedSaoPauloTime(2, 30, () => service.reorganizarPreventivasPendentesPorEscala());
  const rows = db.prepare(`SELECT responsavel_1_id, responsavel_2_id FROM preventiva_execucoes ORDER BY id ASC`).all();
  rows.forEach((row) => {
    assert.equal(Number(row.responsavel_1_id), rodolfo.userId);
    assert.equal(Number(row.responsavel_2_id || 0), 0);
  });
  assert.notEqual(diogo.userId, rodolfo.userId);
});

test('reprocesso redistribui responsáveis com variação de nomes para criticidade alta', () => {
  resetSchema();
  const diogo = addColaborador({ nome: 'Diogo', funcao: 'mecanico', tipo_turno: 'diurno' });
  const emanuel = addColaborador({ nome: 'Emanuel', funcao: 'apoio', tipo_turno: 'apoio' });
  const salviano = addColaborador({ nome: 'Salviano', funcao: 'mecanico', tipo_turno: 'diurno' });
  const junior = addColaborador({ nome: 'Junior', funcao: 'apoio', tipo_turno: 'apoio' });
  addColaborador({ nome: 'Rodolfo', funcao: 'mecanico', tipo_turno: 'plantao' });

  const eqId = Number(db.prepare(`INSERT INTO equipamentos (nome, tipo, criticidade, ativo) VALUES ('Linha de Bombas', 'bomba', 'ALTA', 1)`).run().lastInsertRowid);
  const planoId = Number(db.prepare(`INSERT INTO preventiva_planos (equipamento_id, titulo, frequencia_tipo, frequencia_valor, ativo) VALUES (?, 'Plano distribuição', 'semanal', 1, 1)`).run(eqId).lastInsertRowid);

  for (let i = 0; i < 4; i += 1) {
    db.prepare(`
      INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade)
      VALUES (?, date('now', ?), 'PENDENTE', '', 'ALTA')
    `).run(planoId, `+${i} day`);
  }

  service.reorganizarPreventivasPendentesPorEscala();
  const rows = db.prepare(`SELECT responsavel_1_id, responsavel_2_id FROM preventiva_execucoes ORDER BY id ASC`).all();

  const pares = rows.map((r) => [Number(r.responsavel_1_id || 0), Number(r.responsavel_2_id || 0)].sort((a, b) => a - b).join('-'));
  assert.ok(new Set(pares).size >= 2, 'deve variar pares atribuídos e evitar repetição fixa');

  const idsEscala = new Set([diogo.userId, emanuel.userId, salviano.userId, junior.userId]);
  rows.forEach((r) => {
    assert.ok(idsEscala.has(Number(r.responsavel_1_id || 0)));
    assert.ok(idsEscala.has(Number(r.responsavel_2_id || 0)));
  });
});

test('reprocesso corrige datas pendentes para hoje em diante de forma sequencial', () => {
  resetSchema();
  addColaborador({ nome: 'Diogo', funcao: 'mecanico', tipo_turno: 'diurno' });
  addColaborador({ nome: 'Emanuel', funcao: 'apoio', tipo_turno: 'apoio' });
  addColaborador({ nome: 'Rodolfo', funcao: 'mecanico', tipo_turno: 'plantao' });

  const eqId = Number(db.prepare(`INSERT INTO equipamentos (nome, tipo, criticidade, ativo) VALUES ('Bomba 02', 'bomba', 'MEDIA', 1)`).run().lastInsertRowid);
  const planoId = Number(db.prepare(`INSERT INTO preventiva_planos (equipamento_id, titulo, frequencia_tipo, frequencia_valor, ativo) VALUES (?, 'Plano datas', 'semanal', 1, 1)`).run(eqId).lastInsertRowid);
  db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade) VALUES (?, date('now','-3 day'), 'PENDENTE', '', 'MEDIA')`).run(planoId);
  db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade) VALUES (?, date('now','-1 day'), 'PENDENTE', '', 'MEDIA')`).run(planoId);
  db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade) VALUES (?, date('now','+1 day'), 'PENDENTE', '', 'MEDIA')`).run(planoId);

  service.reorganizarPreventivasPendentesPorEscala();

  const rows = db.prepare(`SELECT data_prevista FROM preventiva_execucoes ORDER BY id ASC`).all();
  const hoje = new Date().toISOString().slice(0, 10);
  rows.forEach((row) => assert.ok(row.data_prevista >= hoje));
  assert.ok(rows[1].data_prevista >= rows[0].data_prevista);
  assert.ok(rows[2].data_prevista >= rows[1].data_prevista);
});

test('turno troca para NOITE às 17:00 e volta para DIA às 05:00', () => {
  resetSchema();
  addColaborador({ nome: 'Diogo', funcao: 'mecanico', tipo_turno: 'diurno' });
  addColaborador({ nome: 'Rodolfo', funcao: 'mecanico', tipo_turno: 'plantao' });
  const eqId = Number(db.prepare(`INSERT INTO equipamentos (nome, tipo, criticidade, ativo) VALUES ('Exaustor 01', 'exaustor', 'BAIXA', 1)`).run().lastInsertRowid);
  const planoId = Number(db.prepare(`INSERT INTO preventiva_planos (equipamento_id, titulo, frequencia_tipo, frequencia_valor, ativo) VALUES (?, 'Plano turno', 'semanal', 1, 1)`).run(eqId).lastInsertRowid);
  const execId = Number(db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade) VALUES (?, date('now'), 'PENDENTE', '', 'BAIXA')`).run(planoId).lastInsertRowid);

  withMockedSaoPauloTime(17, 0, () => service.alocarEquipeExecucaoPreventiva(execId));
  let row = db.prepare(`SELECT responsavel FROM preventiva_execucoes WHERE id = ?`).get(execId);
  assert.equal(String(row.responsavel).includes('Rodolfo'), true);

  withMockedSaoPauloTime(5, 0, () => service.alocarEquipeExecucaoPreventiva(execId));
  row = db.prepare(`SELECT responsavel FROM preventiva_execucoes WHERE id = ?`).get(execId);
  assert.equal(String(row.responsavel).includes('Diogo'), true);
});

test('colaborador sem user_id mantém nome no responsável', () => {
  resetSchema();
  addColaboradorSemUser({ nome: 'Emanuel Sem User', funcao: 'mecanico', tipo_turno: 'diurno' });
  const eqId = Number(db.prepare(`INSERT INTO equipamentos (nome, tipo, criticidade, ativo) VALUES ('Bomba 09', 'bomba', 'BAIXA', 1)`).run().lastInsertRowid);
  const planoId = Number(db.prepare(`INSERT INTO preventiva_planos (equipamento_id, titulo, frequencia_tipo, frequencia_valor, ativo) VALUES (?, 'Plano sem user', 'semanal', 1, 1)`).run(eqId).lastInsertRowid);
  const execId = Number(db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade) VALUES (?, date('now'), 'PENDENTE', '', 'BAIXA')`).run(planoId).lastInsertRowid);

  withMockedSaoPauloTime(9, 10, () => service.alocarEquipeExecucaoPreventiva(execId));
  const row = db.prepare(`SELECT responsavel, responsavel_1_id FROM preventiva_execucoes WHERE id = ?`).get(execId);
  assert.equal(String(row.responsavel).includes('Emanuel Sem User'), true);
  assert.equal(Number(row.responsavel_1_id || 0), 0);
});

test('agrupa preventivas baixas da mesma área no mesmo responsável e alterna áreas diferentes', () => {
  resetSchema();
  addColaborador({ nome: 'Diogo', funcao: 'mecanico', tipo_turno: 'diurno' });
  addColaborador({ nome: 'Junior', funcao: 'apoio', tipo_turno: 'apoio' });
  addColaborador({ nome: 'Salviano', funcao: 'mecanico', tipo_turno: 'diurno' });
  addColaborador({ nome: 'Rodolfo', funcao: 'mecanico', tipo_turno: 'plantao' });

  const ex1 = Number(db.prepare(`INSERT INTO equipamentos (nome, tipo, setor, criticidade, ativo) VALUES ('Exaustor 1', 'exaustor', 'A1', 'BAIXA', 1)`).run().lastInsertRowid);
  const ex2 = Number(db.prepare(`INSERT INTO equipamentos (nome, tipo, setor, criticidade, ativo) VALUES ('Exaustor 2', 'exaustor', 'A1', 'BAIXA', 1)`).run().lastInsertRowid);
  const b1 = Number(db.prepare(`INSERT INTO equipamentos (nome, tipo, setor, criticidade, ativo) VALUES ('Bomba 1', 'bomba', 'B2', 'BAIXA', 1)`).run().lastInsertRowid);
  const p1 = Number(db.prepare(`INSERT INTO preventiva_planos (equipamento_id, titulo, frequencia_tipo, frequencia_valor, ativo) VALUES (?, 'P1', 'semanal', 1, 1)`).run(ex1).lastInsertRowid);
  const p2 = Number(db.prepare(`INSERT INTO preventiva_planos (equipamento_id, titulo, frequencia_tipo, frequencia_valor, ativo) VALUES (?, 'P2', 'semanal', 1, 1)`).run(ex2).lastInsertRowid);
  const p3 = Number(db.prepare(`INSERT INTO preventiva_planos (equipamento_id, titulo, frequencia_tipo, frequencia_valor, ativo) VALUES (?, 'P3', 'semanal', 1, 1)`).run(b1).lastInsertRowid);
  db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade) VALUES (?, date('now'), 'PENDENTE', '', 'BAIXA')`).run(p1);
  db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade) VALUES (?, date('now'), 'PENDENTE', '', 'BAIXA')`).run(p2);
  db.prepare(`INSERT INTO preventiva_execucoes (plano_id, data_prevista, status, responsavel, criticidade) VALUES (?, date('now'), 'PENDENTE', '', 'BAIXA')`).run(p3);

  withMockedSaoPauloTime(9, 0, () => service.reorganizarPreventivasPendentesPorEscala());
  const rows = db.prepare(`SELECT plano_id, responsavel_1_id FROM preventiva_execucoes ORDER BY id ASC`).all();
  assert.equal(Number(rows[0].responsavel_1_id), Number(rows[1].responsavel_1_id));
  assert.notEqual(Number(rows[1].responsavel_1_id), Number(rows[2].responsavel_1_id));
});
