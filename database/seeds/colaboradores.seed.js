const db = require('../db');

function ensureColaboradorSeed() {
  const has = db.prepare(`SELECT id FROM colaboradores WHERE lower(nome)=lower('Colaborador Demo') LIMIT 1`).get();
  if (has) return;

  const info = db.prepare(`
    INSERT INTO colaboradores (nome, apelido, funcao, setor, data_admissao, status, telefone, ativo, created_at, updated_at)
    VALUES ('Colaborador Demo', 'Demo', 'MECANICO', 'MANUTENCAO', date('now','-2 years'), 'ATIVO', '(31)99999-0000', 1, datetime('now'), datetime('now'))
  `).run();

  const id = Number(info.lastInsertRowid);

  db.prepare(`
    INSERT INTO colaborador_detalhes (colaborador_id, tipo_sanguineo, contato_emergencia, restricao_operacional, observacoes, created_at, updated_at)
    VALUES (?, 'O+', 'Maria Demo - (31)98888-1111', 'Sem trabalho em altura sem APR', 'Seed inicial do módulo.', datetime('now'), datetime('now'))
  `).run(id);

  db.prepare(`INSERT INTO materiais (nome, unidade, created_at, updated_at) VALUES ('Eletrodo 6013', 'KG', datetime('now'), datetime('now')) ON CONFLICT(nome) DO NOTHING`).run();
  db.prepare(`INSERT INTO materiais (nome, unidade, created_at, updated_at) VALUES ('Disco de corte 7"', 'UN', datetime('now'), datetime('now')) ON CONFLICT(nome) DO NOTHING`).run();

  console.log('✔ Seed: módulo colaboradores inicializado');
}

module.exports = { ensureColaboradorSeed };
