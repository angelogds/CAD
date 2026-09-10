const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Meu Portal Fase 2B publica somente consultas pessoais autenticadas', () => {
  const routes = read('modules/meu-portal/meu-portal.routes.js');
  const controller = read('modules/meu-portal/meu-portal-fase2b.controller.js');
  const service = read('modules/meu-portal/meu-portal-fase2b.service.js');

  assert.match(routes, /router\.use\(requireLogin\)/);
  assert.match(routes, /router\.get\('\/treinamentos', fase2bCtrl\.treinamentos\)/);
  assert.match(routes, /router\.get\('\/dados-profissionais', fase2bCtrl\.dadosProfissionais\)/);
  assert.match(routes, /router\.get\('\/servicos', fase2bCtrl\.servicos\)/);
  assert.match(controller, /getOwnTrainings\(req\.session\.user\.id\)/);
  assert.match(controller, /getOwnProfessionalData\(req\.session\.user\.id\)/);
  assert.match(controller, /getOwnServiceHistory\(req\.session\.user\.id/);
  assert.match(service, /WHERE user_id=\?/);
  assert.doesNotMatch(routes, /router\.post\('\/(?:treinamentos|dados-profissionais|servicos)'/);
  assert.doesNotMatch(service, /filters\.colaborador|req\.query\.colaborador|req\.body\.colaborador/i);
});

test('Treinamentos reutiliza certificados existentes e não cria cadastro paralelo', () => {
  const service = read('modules/meu-portal/meu-portal-fase2b.service.js');
  const migration = read('database/migrations/128_colaboradores_modulo.js');
  const view = read('views/meu-portal/treinamentos.ejs');

  assert.match(migration, /CREATE TABLE IF NOT EXISTS certificados/);
  assert.match(migration, /idx_cert_colab/);
  assert.match(service, /tableExists\('certificados'\)/);
  assert.match(service, /WHERE colaborador_id=\?/);
  assert.match(service, /certificateVisualStatus/);
  assert.match(service, /VENCE_EM_BREVE/);
  assert.match(service, /safeCertificateUrl/);
  assert.doesNotMatch(service, /INSERT\s+INTO\s+certificados|UPDATE\s+certificados|DELETE\s+FROM\s+certificados/i);
  assert.doesNotMatch(view, /method="POST"/i);
});

test('Treinamentos mostra validade, status e arquivo em modo somente leitura', () => {
  const view = read('views/meu-portal/treinamentos.ejs');

  assert.match(view, /Meus treinamentos/);
  assert.match(view, /Vencendo/);
  assert.match(view, /Vencidos/);
  assert.match(view, /Carga horária/);
  assert.match(view, /Validade/);
  assert.match(view, /PENDENTE/);
  assert.match(view, /target="_blank"/);
  assert.match(view, /somente leitura/);
});

test('Dados profissionais vêm da ficha mestre e permanecem sob RH ADMIN', () => {
  const service = read('modules/meu-portal/meu-portal-fase2b.service.js');
  const view = read('views/meu-portal/dados-profissionais.ejs');

  assert.match(service, /SELECT \* FROM colaboradores WHERE user_id=\?/);
  assert.match(service, /lider_id/);
  assert.match(service, /calculateTenure/);
  assert.match(view, /Admissão/);
  assert.match(view, /Tempo de casa/);
  assert.match(view, /Líder \/ responsável/);
  assert.match(view, /Dados controlados pelo RH\/ADMIN/);
  assert.match(view, /não exibe dados de saúde, emergência, exames/);
  assert.doesNotMatch(view, /method="POST"/i);
});

test('Histórico técnico reutiliza OS execuções e fallbacks sem lançamento manual', () => {
  const service = read('modules/meu-portal/meu-portal-fase2b.service.js');
  const osService = read('modules/os/os.service.js');

  assert.match(service, /tableExists\('os_execucoes'\)/);
  assert.match(service, /executor_user_id/);
  assert.match(service, /auxiliar_user_id/);
  assert.match(service, /executor_colaborador_id/);
  assert.match(service, /auxiliar_colaborador_id/);
  assert.match(service, /tableExists\('os_alocacoes'\)/);
  assert.match(service, /duracao_confiavel/);
  assert.match(osService, /function createExecucao\(/);
  assert.match(osService, /finalizado_em/);
  assert.doesNotMatch(service, /INSERT\s+INTO\s+os|UPDATE\s+os\s+SET|DELETE\s+FROM\s+os/i);
});

test('Meus Serviços valida filtros, limita resultado e não inventa duração', () => {
  const service = read('modules/meu-portal/meu-portal-fase2b.service.js');
  const view = read('views/meu-portal/servicos.ejs');

  assert.match(service, /normalizeServiceFilters/);
  assert.match(service, /data inicial não pode ser posterior à data final/);
  assert.match(service, /slice\(0, 300\)/);
  assert.match(service, /source === 'EXECUCAO' \? durationMinutes/);
  assert.match(view, /name="q"/);
  assert.match(view, /name="tipo"/);
  assert.match(view, /name="inicio"/);
  assert.match(view, /name="fim"/);
  assert.match(view, /OS com participação/);
  assert.match(view, /Tempo registrado/);
  assert.match(view, /Somente execuções com início\/fim/i);
  assert.match(view, /somente leitura/i);
});

test('Home da Fase 2B ativa novos serviços e mantém RH na Fase 3', () => {
  const view = read('views/meu-portal/index.ejs');
  const css = read('public/css/meu-portal-fase2b.css');

  assert.match(view, /href="\/meu-portal\/dados-profissionais"/);
  assert.match(view, /href="\/meu-portal\/treinamentos"/);
  assert.match(view, /href="\/meu-portal\/servicos"/);
  assert.match(view, /Treinamentos[\s\S]*DISPONÍVEL/);
  assert.match(view, /Meus serviços[\s\S]*DISPONÍVEL/);
  assert.match(view, /RH[\s\S]*PLANEJADO • Fase 3/);
  assert.match(css, /\.my-roadmap-grid\{grid-template-columns:repeat\(auto-fit/);
  assert.match(css, /@media\(max-width:620px\)/);
});
