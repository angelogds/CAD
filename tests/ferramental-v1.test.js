const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('V1 cria custódia única, grupos de responsáveis e histórico', () => {
  const migration = read('database/migrations/217_ferramental_v1.js');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ferramental_itens/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ferramental_equipes/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ferramental_custodias/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_ferramental_custodia_ativa/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ferramental_movimentacoes/);
});

test('armário V1 separa quatro compartimentos pessoais e quatro de ferramental', () => {
  const service = read('modules/ferramental/ferramental.service.js');
  assert.match(service, /numero <= 4 \? 'PESSOAL' : 'FERRAMENTAL'/);
  assert.match(service, /Compartimentos inferiores reservados ao ferramental|compartimentos inferiores reservados ao ferramental/i);
  assert.match(service, /ids\.length < 1 \|\| ids\.length > 2/);
  assert.match(service, /MNT-FER-/);
});

test('rotas administrativas ficam protegidas pelo PCM e consulta fica no Meu Portal', () => {
  const pcmRoutes = read('modules/pcm/pcm.routes.js');
  const portalRoutes = read('modules/meu-portal/meu-portal.routes.js');
  assert.match(pcmRoutes, /\/ferramental\/ferramentas".*PCM_MANAGE/);
  assert.match(pcmRoutes, /\/ferramental\/custodias".*PCM_MANAGE/);
  assert.match(portalRoutes, /'\/ferramental'.*requireMaintenanceSelfService/);
  assert.match(portalRoutes, /'\/ferramental\/pdf'.*requireMaintenanceSelfService/);
});

test('V1 expõe telas e ficha PDF', () => {
  const portal = read('views/meu-portal/index.ejs');
  const nav = read('views/pcm/partials/internal-nav.ejs');
  const pdf = read('modules/ferramental/ferramental.pdf.js');
  assert.match(portal, /Meu Ferramental/);
  assert.match(nav, />Ferramental</);
  assert.match(pdf, /Ficha de Responsabilidade de Ferramental/);
  assert.match(pdf, /assinatura manual/i);
});
