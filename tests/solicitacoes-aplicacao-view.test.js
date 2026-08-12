const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('formulário permite escolher equipamento ou descrever outra aplicação', () => {
  const view = fs.readFileSync(path.join(__dirname, '../views/solicitacoes/new.ejs'), 'utf8');
  assert.match(view, /name="tipo_aplicacao" value="EQUIPAMENTO"/);
  assert.match(view, /name="tipo_aplicacao" value="OUTRO"/);
  assert.match(view, /name="equipamento_id"/);
  assert.match(view, /name="destino_uso"/);
  assert.match(view, /updateApplicationFields/);
});

test('migração persiste a descrição de aplicação não vinculada a equipamento', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../database/migrations/181_solicitacoes_destino_uso.sql'), 'utf8');
  assert.match(migration, /ALTER TABLE solicitacoes ADD COLUMN destino_uso TEXT/);
});
