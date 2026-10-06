const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('V1.1 cria aceite individual e retroalimenta custódias ativas', () => {
  const migration = read('database/migrations/218_ferramental_aceite_v1_1.js');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ferramental_aceites/);
  assert.match(migration, /UNIQUE\(custodia_id, user_id\)/);
  assert.match(migration, /INSERT OR IGNORE INTO ferramental_aceites/);
  assert.match(migration, /WHERE c\.ativo = 1/);
});

test('nova custódia gera aceite para cada membro e cancela pendência anterior', () => {
  const service = read('modules/ferramental/ferramental.service.js');
  const aceite = read('modules/ferramental/ferramental.aceite.service.js');
  assert.match(service, /cancelPendingForCustody\(previous\.id\)/);
  assert.match(service, /createPendingForCustody\(result\.lastInsertRowid, teamId\)/);
  assert.match(aceite, /SELECT \?, user_id, 'PENDENTE'/);
  assert.match(aceite, /status='CANCELADO'/);
});

test('aceite exige selfie, assinatura e termo e grava trilha de auditoria', () => {
  const aceite = read('modules/ferramental/ferramental.aceite.service.js');
  assert.match(aceite, /Selfie e assinatura são obrigatórias/);
  assert.match(aceite, /termo_aceito/);
  assert.match(aceite, /ip_origem/);
  assert.match(aceite, /user_agent/);
  assert.match(aceite, /ACEITE_RESPONSABILIDADE/);
  assert.match(aceite, /DIVERGENCIA_RECEBIMENTO/);
});

test('evidências ficam fora das pastas públicas e acesso é autenticado', () => {
  const evidence = read('modules/ferramental/ferramental.evidence.js');
  const portalRoutes = read('modules/meu-portal/meu-portal.routes.js');
  const pcmRoutes = read('modules/pcm/pcm.routes.js');
  assert.match(evidence, /storage\.DATA_DIR, 'ferramental', 'evidencias'/);
  assert.doesNotMatch(evidence, /UPLOAD_DIR|IMAGE_DIR/);
  assert.match(portalRoutes, /ferramental\/aceites\/:aceiteId\/evidencia\/:tipo'.*requireMaintenanceSelfService/);
  assert.match(pcmRoutes, /ferramental\/aceites\/:aceiteId\/evidencia\/:tipo".*PCM_ACCESS/);
});

test('Meu Ferramental captura selfie e assinatura e permite divergência', () => {
  const view = read('views/meu-portal/ferramental.ejs');
  const client = read('public/js/ferramental-aceite.js');
  assert.match(view, /capture="user"/);
  assert.match(view, /data-signature-canvas/);
  assert.match(view, /termo_aceito/);
  assert.match(view, /Registrar divergência/);
  assert.match(client, /canvas\.toDataURL\('image\/png'\)/);
});

test('PDF V1.1 registra situação dos aceites sem duplicar ativo compartilhado', () => {
  const pdf = read('modules/ferramental/ferramental.pdf.js');
  assert.match(pdf, /Confirmações digitais V1\.1/);
  assert.match(pdf, /Selfie e assinatura digital arquivadas/);
  assert.match(pdf, /cada responsável mantém seu próprio aceite e evidência/);
});

test('novos módulos JavaScript passam no parser do Node', () => {
  [
    'modules/ferramental/ferramental.aceite.service.js',
    'modules/ferramental/ferramental.evidence.js',
    'modules/ferramental/ferramental.controller.js',
    'modules/ferramental/ferramental.pdf.js',
    'public/js/ferramental-aceite.js',
    'database/migrations/218_ferramental_aceite_v1_1.js',
  ].forEach((file) => {
    execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
  });
});
