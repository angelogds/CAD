const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('painel de demandas possui indicadores, filtros e agrupamento operacional', () => {
  const view = read('views/demandas/index.ejs');
  assert.match(view, /demand-metrics/);
  assert.match(view, /Concluídas e histórico/);
  assert.match(view, /Demandas críticas/);
  assert.match(view, /Prioridade alta/);
  assert.match(view, /Prioridade média/);
  assert.match(view, /Prioridade baixa/);
  assert.doesNotMatch(view, /title: 'Críticas e altas'/);
  assert.match(view, /name="responsavel_user_id"/);
  assert.match(view, /Nenhuma demanda encontrada/);
});

test('controller envia filtros e painel consolidado para a listagem', () => {
  const controller = read('modules/demandas/demandas.controller.js');
  assert.match(controller, /service\.getPainel/);
  assert.match(controller, /responsaveis: service\.listResponsaveis/);
  assert.match(controller, /tab: normalizeChoice/);
});

test('lista somente responsáveis ativos usando a coluna do schema de usuários', () => {
  const service = read('modules/demandas/demandas.service.js');
  assert.match(service, /FROM users WHERE ativo=1 ORDER BY name/);
  assert.doesNotMatch(service, /FROM users WHERE active=1/);
});

test('detalhe e cadastro usam o mesmo padrão visual', () => {
  const form = read('views/demandas/new.ejs');
  const detail = read('views/demandas/view.ejs');
  const css = read('public/css/demandas.css');
  assert.match(form, /modern-demand-form/);
  assert.match(detail, /demand-progress/);
  assert.match(detail, /Histórico e rastreabilidade/);
  const sharedButtons = read('public/css/ui-buttons.css');
  assert.match(form, /demand-btn[^\"]*ui-btn/);
  assert.match(detail, /demand-btn[^\"]*ui-btn/);
  assert.match(sharedButtons, /:is\(\.btn, \.ui-btn\).*:hover/);
  assert.doesNotMatch(css, /(?:^|})\s*\.demand-btn\s*\{/);
  assert.match(css, /@media \(max-width:720px\)/);
});


test('fila de demandas sinaliza tempo aberto atraso e ausência de atualização', () => {
  const view = read('views/demandas/index.ejs');
  const service = read('modules/demandas/demandas.service.js');
  const css = read('public/css/demandas.css');

  assert.match(service, /AS dias_aberta/);
  assert.match(service, /AS dias_sem_movimento/);
  assert.match(service, /AS prazo_atrasado/);
  assert.match(service, /AS dias_atraso/);
  assert.match(service, /AS criticas/);
  assert.match(service, /AS altas/);
  assert.match(service, /AS prazos_atrasados/);
  assert.match(service, /AS sem_atualizacao/);

  assert.match(view, /Aberta há/);
  assert.match(view, /Prazo vencido há/);
  assert.match(view, /Sem atualização há/);
  assert.match(view, /Atualizada hoje/);
  assert.match(view, /demand-time-chip/);

  assert.match(css, /\.demand-row-v2\.is-overdue/);
  assert.match(css, /\.demand-row-v2\.is-stale/);
  assert.match(css, /\.demand-time-chip\.danger/);
  assert.match(css, /\.priority-critica \.priority-heading/);
  assert.match(css, /\.priority-alta \.priority-heading/);
});

test('filtro visual de prioridade mantém crítica alta média e baixa independentes', () => {
  const view = read('views/demandas/index.ejs');
  assert.match(view, /\['URGENTE','ALTA','NORMAL','BAIXA'\]/);
  assert.doesNotMatch(view, /option value="ELEVADA"/);
});


test('faixa lateral de cada demanda segue exclusivamente a prioridade', () => {
  const view = read('views/demandas/index.ejs');
  const css = read('public/css/demandas.css');

  assert.match(view, /demand-priority-<%= slug\(d\.prioridade\) %>/);
  assert.match(css, /\.demand-row-v2\.demand-priority-urgente:before\{background:#c3222a\}/);
  assert.match(css, /\.demand-row-v2\.demand-priority-alta:before\{background:#e9791a\}/);
  assert.match(css, /\.demand-row-v2\.demand-priority-normal:before\{background:#d5a600\}/);
  assert.match(css, /\.demand-row-v2\.demand-priority-baixa:before\{background:#168a4b\}/);
  assert.match(css, /\.priority-media \.priority-heading\{border-left-color:#d5a600/);
  assert.match(css, /\.priority-normal\{border-color:#ead77b;background:#fffbea;color:#7a5c00\}/);
  assert.doesNotMatch(css, /\.demand-row-v2:nth-child[^}]*:before/);

  assert.doesNotMatch(css, /\.demand-row-v2\.is-overdue\{box-shadow:/);
  assert.doesNotMatch(css, /\.demand-row-v2\.is-stale\{box-shadow:/);
  assert.doesNotMatch(css, /\.demand-row-v2\.is-aging\{box-shadow:/);
});


test('demandas e subdemandas oferecem abrir editar e apagar com RBAC existente', () => {
  const index = read('views/demandas/index.ejs');
  const detail = read('views/demandas/view.ejs');
  const form = read('views/demandas/new.ejs');
  const routes = read('modules/demandas/demandas.routes.js');
  const controller = read('modules/demandas/demandas.controller.js');
  const service = read('modules/demandas/demandas.service.js');
  const rbac = read('config/rbac.js');
  const css = read('public/css/demandas.css');

  assert.match(index, />Abrir<\/a>/);
  assert.match(index, />Editar<\/a>/);
  assert.match(index, />Apagar<\/button>/);
  assert.match(detail, /demand-row-actions/);
  assert.match(detail, /\/demandas\/<%= child\.id %>\/edit/);
  assert.match(detail, /\/demandas\/<%= child\.id %>\/delete/);

  assert.match(routes, /\/:id\/edit'.*ACCESS\.demandas_manage/);
  assert.match(routes, /\/:id\/delete'.*ACCESS\.demandas_delete/);
  assert.match(controller, /function editForm/);
  assert.match(controller, /function updateDetails/);
  assert.match(controller, /function remove/);
  assert.match(service, /function updateDetails/);
  assert.match(service, /function remove/);
  assert.match(service, /subdemandas vinculadas/);
  assert.match(service, /solicitações de materiais vinculadas/);
  assert.match(service, /Ordem de Serviço vinculada/);

  assert.match(rbac, /demandas_delete:\s*\[ROLE\.ADMIN\]/);
  assert.match(form, /editMode/);
  assert.match(form, /Salvar alterações/);
  assert.match(css, /\.demand-row-actions/);
  assert.match(index, /ui-btn--danger/);
});
