const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Fase 3 cria exames ocupacionais de forma aditiva e indexada', () => {
  const migration = read('database/migrations/194_rh_exames_ocupacionais.js');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS rh_exames_ocupacionais/);
  assert.match(migration, /colaborador_id INTEGER NOT NULL/);
  assert.match(migration, /validade_ate TEXT/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_rh_exames_colaborador/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_rh_exames_validade/);
  assert.doesNotMatch(migration, /DROP\s+TABLE|DROP\s+COLUMN|DELETE\s+FROM/i);
});

test('RBAC separa visão geral, gestão e conteúdo sensível sem liberar escala_manage ao RH', () => {
  const rbac = read('config/rbac.js');
  assert.match(rbac, /rh_view:\s*\[ROLE\.ADMIN, ROLE\.RH, ROLE\.DIRETORIA\]/);
  assert.match(rbac, /rh_manage:\s*\[ROLE\.ADMIN, ROLE\.RH\]/);
  assert.match(rbac, /rh_sensitive:\s*\[ROLE\.ADMIN, ROLE\.RH\]/);
  const manage = rbac.match(/escala_manage:\s*\[([^\]]+)\]/)?.[1] || '';
  assert.doesNotMatch(manage, /ROLE\.RH/);
});

test('exames ficam fora do diretório público de uploads e download exige ADMIN ou RH', () => {
  const routes = read('modules/colaboradores/colaboradores.routes.js');
  const service = read('modules/rh/rh.service.js');
  assert.match(routes, /path\.join\(storagePaths\.DATA_DIR, 'rh', 'exames'\)/);
  assert.doesNotMatch(routes, /path\.join\(storagePaths\.UPLOAD_DIR, 'rh', 'exames'\)/);
  assert.match(routes, /router\.post\('\/:id\/exames', requireRole\(\['ADMIN', 'RH'\]\)/);
  assert.match(routes, /router\.get\('\/:id\/exames\/:exameId\/arquivo', requireRole\(\['ADMIN', 'RH'\]\)/);
  assert.match(service, /path\.basename\(String\(row\.arquivo_nome\)\)/);
});

test('upload de exame limita tamanho e tipos e trata erro sem derrubar a página', () => {
  const routes = read('modules/colaboradores/colaboradores.routes.js');
  assert.match(routes, /fileSize:\s*10 \* 1024 \* 1024/);
  assert.match(routes, /application\/pdf/);
  assert.match(routes, /image\/jpeg/);
  assert.match(routes, /image\/png/);
  assert.match(routes, /image\/webp/);
  assert.match(routes, /function uploadExameSeguro/);
  assert.match(routes, /LIMIT_FILE_SIZE/);
  assert.match(routes, /res\.redirect\(`\/escala\/rh\?colaborador=/);
});

test('central RH reutiliza ficha mestre, Escala, Banco de Horas, folgas e certificados', () => {
  const service = read('modules/rh/rh.service.js');
  const people = read('modules/rh/rh.people.js');
  assert.match(service, /require\('\.\.\/escala\/escala\.service'\)/);
  assert.match(service, /require\('\.\.\/escala\/escala\.folga-solicitacao\.service'\)/);
  assert.match(service, /require\('\.\.\/colaboradores\/colaboradores\.service'\)/);
  assert.match(service, /colaboradoresService\.getTabData/);
  assert.match(service, /escala\.calcularSaldoBancoHoras/);
  assert.match(service, /folgaSolicitacoes\.listarSolicitacoes/);
  assert.match(people, /colaboradoresService\.listColaboradores\(\{ status: 'ATIVO' \}\)/);
  assert.match(people, /escala\.listarPainelEscala/);
  assert.doesNotMatch(service, /CREATE TABLE|ALTER TABLE|DROP TABLE/i);
});

test('solicitação de folga mantém aprovação operacional e notifica RH em best effort', () => {
  const folgaController = read('modules/escala/escala.folga.controller.js');
  const folgaService = read('modules/escala/escala.folga-solicitacao.service.js');
  const notifications = read('modules/rh/rh.notifications.js');
  assert.match(folgaController, /notifyNewLeaveRequest\(solicitacaoId\)/);
  assert.match(folgaController, /notifyLeaveDecision\(id, 'APROVADA'\)/);
  assert.match(folgaController, /notifyLeaveDecision\(id, 'REPROVADA'\)/);
  assert.match(folgaService, /canAccessModule\(normalizeRole\(user\?\.role\), 'escala_manage'\)/);
  assert.match(notifications, /setImmediate/);
  assert.match(notifications, /push\.sendToUser/);
  assert.match(notifications, /UPPER\(COALESCE\(role,''\)\)='RH'/);
});

test('Meu RH é autenticado, estritamente pessoal e não aceita colaborador arbitrário', () => {
  const routes = read('modules/meu-portal/meu-portal.routes.js');
  const portalController = read('modules/rh/rh.portal.controller.js');
  const service = read('modules/rh/rh.service.js');
  assert.match(routes, /router\.use\(requireLogin\)/);
  assert.match(routes, /router\.get\('\/rh', rhPortalCtrl\.index\)/);
  assert.match(portalController, /service\.getOwnPortalData\(req\.session\.user\.id\)/);
  assert.match(service, /WHERE user_id=\?/);
  assert.doesNotMatch(portalController, /req\.params\.colaborador|req\.query\.colaborador|req\.body\.colaborador/);
});

test('interface ativa RH no Meu Portal e cria acesso dedicado no menu lateral', () => {
  const portal = read('views/meu-portal/index.ejs');
  const sidebar = read('views/partials/sidebar.ejs');
  const rhView = read('views/rh/index.ejs');
  const css = read('public/css/rh-portal.css');
  assert.match(portal, /href="\/meu-portal\/rh"/);
  assert.match(portal, /RH[\s\S]*DISPONÍVEL • Abrir/);
  assert.match(sidebar, /const canRH = can\('rh_view'\)/);
  assert.match(sidebar, /navItem\('\/escala\/rh', 'RH', activeMenu === 'rh'\)/);
  assert.match(rhView, /Pendências do RH/);
  assert.match(rhView, /Exames ocupacionais/);
  assert.match(rhView, /Documentos/);
  assert.match(rhView, /Treinamentos e certificados/);
  assert.match(css, /@media\(max-width:760px\)/);
});

test('anexo de exame não expõe CID, diagnóstico ou resultado clínico no modelo', () => {
  const migration = read('database/migrations/194_rh_exames_ocupacionais.js');
  const view = read('views/rh/index.ejs');
  assert.doesNotMatch(migration, /\bcid\b|diagnostico|diagnóstico|resultado_clinico/i);
  assert.match(view, /Não registrar CID, diagnóstico ou resultado clínico detalhado/);
});
