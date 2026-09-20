const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('saúde do sistema separa diagnóstico pesado do alerta global', () => {
  const server = read('server.js');
  const service = read('modules/admin/storage-maintenance.service.js');

  assert.match(service, /function capacity\(/);
  assert.match(service, /function capacityStatus\(/);
  assert.match(server, /storageMaintenance\.capacity\(\)/);
  assert.match(server, /storageMaintenance\.capacityStatus\(diag\)/);
  assert.doesNotMatch(server, /storageMaintenance\.diagnostic\(\)/);
  assert.match(server, /evita varredura síncrona de todo o volume em cada requisição/);
});

test('painel executa quick_check do SQLite sem desligar foreign keys', () => {
  const service = read('modules/admin/storage-maintenance.service.js');

  assert.match(service, /PRAGMA quick_check/);
  assert.match(service, /journalMode/);
  assert.match(service, /foreignKeys/);
  assert.match(service, /busyTimeout/);
  assert.doesNotMatch(service, /foreign_keys\s*=\s*OFF/i);
});

test('backup SQLite usa snapshot consistente e proteção de espaço livre', () => {
  const service = read('modules/admin/storage-maintenance.service.js');
  const routes = read('modules/admin/storage.routes.js');

  assert.match(service, /function createBackup\(\)/);
  assert.match(service, /minimumFree = Math\.max\(100 \* MB, dbBytes \* 2\)/);
  assert.match(service, /VACUUM INTO/);
  assert.match(routes, /'\/armazenamento\/backup', requireLogin, requireRole\(ADMIN\)/);
  assert.match(routes, /maintenance\.createBackup\(\)/);
});

test('rota de armazenamento usa healthSnapshot e preserva permissões atuais', () => {
  const routes = read('modules/admin/storage.routes.js');

  assert.match(routes, /'\/armazenamento', requireLogin, requireRole\(ACCESS\)/);
  assert.match(routes, /const health = maintenance\.healthSnapshot\(\)/);
  assert.match(routes, /diagnostic: health\.storage/);
  assert.match(routes, /'\/armazenamento\/otimizar', requireLogin, requireRole\(ADMIN\)/);
  assert.match(routes, /'\/limpeza-volume', requireLogin, requireRole\(ADMIN\)/);
});

test('tela mostra saúde, backup, runtime e mantém manutenção existente', () => {
  const view = read('views/admin/armazenamento.ejs');

  assert.match(view, />Saúde do Sistema</);
  assert.match(view, /SQLite quick_check/);
  assert.match(view, /Backups do SQLite/);
  assert.match(view, /Runtime/);
  assert.match(view, /Maiores arquivos do volume/);
  assert.match(view, /action="\/admin\/armazenamento\/backup"/);
  assert.match(view, /action="\/admin\/armazenamento\/limpar-sessoes"/);
  assert.match(view, /action="\/admin\/armazenamento\/checkpoint-wal"/);
  assert.match(view, /action="\/admin\/armazenamento\/otimizar"/);
});

test('view de saúde continua compilando como EJS', () => {
  assert.doesNotThrow(() => ejs.compile(read('views/admin/armazenamento.ejs')));
});
