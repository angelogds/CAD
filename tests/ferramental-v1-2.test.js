const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('V1.2 adiciona QR único, tratamento de divergência e conferência periódica', () => {
  const migration = read('database/migrations/219_ferramental_v1_2.js');
  assert.match(migration, /qr_token/);
  assert.match(migration, /idx_ferramental_qr_token/);
  assert.match(migration, /ferramental_inventarios/);
  assert.match(migration, /ferramental_inventario_itens/);
  assert.match(migration, /tratamento_status/);
});

test('novas ferramentas também recebem QR e consulta usa token sem expor ID sequencial', () => {
  const service = read('modules/ferramental/ferramental.service.js');
  assert.match(service, /randomblob\(16\)/);
  assert.match(service, /getToolByQrToken/);
  assert.match(service, /WHERE qr_token=\?/);
});

test('PCM cria conferência por equipe e cada responsável recebe sua própria linha', () => {
  const inventory = read('modules/ferramental/ferramental.inventario.service.js');
  assert.match(inventory, /for \(const custody of custodies\)/);
  assert.match(inventory, /for \(const member of members\)/);
  assert.match(inventory, /Já existe uma conferência aberta para esta equipe/);
  assert.match(inventory, /CONFIRMADO/);
  assert.match(inventory, /DANIFICADO/);
  assert.match(inventory, /NAO_LOCALIZADO/);
  assert.match(inventory, /EM_MANUTENCAO/);
});

test('divergência recusada pode ser tratada no PCM e reabre aceite preservando auditoria', () => {
  const acceptance = read('modules/ferramental/ferramental.aceite.service.js');
  assert.match(acceptance, /function resolveDivergence/);
  assert.match(acceptance, /TRATAMENTO_DIVERGENCIA/);
  assert.match(acceptance, /RESOLVIDO_REABERTO/);
  assert.match(acceptance, /status='PENDENTE'/);
});

test('QR fica protegido por login e RBAC de ferramental', () => {
  const routes = read('modules/ferramental/ferramental.routes.js');
  const rbac = read('config/rbac.js');
  const server = read('server.js');
  assert.match(routes, /requireLogin/);
  assert.match(routes, /ACCESS\.ferramental_view/);
  assert.match(rbac, /ferramental_view/);
  assert.match(server, /mount\("\/ferramental", "\.\/modules\/ferramental\/ferramental\.routes"\)/);
});

test('PCM e Meu Portal expõem fluxo V1.2 e etiqueta QR em PDF', () => {
  const pcm = read('views/ferramental/index.ejs');
  const portal = read('views/meu-portal/ferramental.ejs');
  const controller = read('modules/ferramental/ferramental.controller.js');
  assert.match(pcm, /Conferência periódica/);
  assert.match(pcm, /Tratar e reabrir aceite/);
  assert.match(pcm, /Etiqueta PDF/);
  assert.match(portal, /Conferência do meu ferramental/);
  assert.match(portal, /Não localizado/);
  assert.match(portal, /Identificar/);
  assert.match(controller, /toolLabelPdf/);
  assert.match(controller, /QRCode\.toBuffer/);
});
