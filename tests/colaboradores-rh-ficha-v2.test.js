const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('controller de colaboradores reutiliza o serviço oficial da Escala', () => {
  const source = read('modules/colaboradores/colaboradores.controller.js');

  assert.match(source, /require\('\.\.\/escala\/escala\.service'\)/);
  assert.match(source, /escalaService\.listarPainelEscala/);
  assert.match(source, /escalaService\.listarHorasExtras/);
  assert.match(source, /escalaService\.calcularSaldoBancoHoras/);
  assert.match(source, /escalaService\.listarMovimentosBancoHoras/);
  assert.match(source, /escalaService\.listarFolgas/);
});

test('central de colaboradores possui KPIs, cadastro rápido e situação operacional', () => {
  const source = read('views/colaboradores/index.ejs');

  assert.match(source, /colab-kpi-grid/);
  assert.match(source, /data-colab-create-panel/);
  assert.match(source, /Novo colaborador/);
  assert.match(source, /Na escala atual/);
  assert.match(source, /HE no mês/);
  assert.match(source, /Banco acumulado/);
  assert.match(source, /operacional/);
  assert.match(source, /\/escala\/rh/);
  assert.match(source, /Abrir ficha/);
});

test('ficha individual consolida Escala, HE, banco e folgas sem remover fluxos existentes', () => {
  const source = read('views/colaboradores/show.ejs');

  for (const label of [
    'Resumo',
    'Dados profissionais',
    'Escala',
    'Horas extras',
    'Banco de horas',
    'Folgas e ausências',
    'Ferramental',
    'EPIs',
    'Materiais',
    'Treinamentos',
    'Certificados',
    'Documentos',
    'Histórico',
    'Saúde e emergência',
  ]) assert.match(source, new RegExp(label));

  assert.match(source, /canViewEmergencyDetails/);
  assert.match(source, /operational\?\.statusAtual/);
  assert.match(source, /horasExtras/);
  assert.match(source, /bancoMovimentos/);
  assert.match(source, /folgas/);

  for (const action of [
    '/perfil',
    '/ferramental',
    '/epis',
    '/materiais',
    '/certificados',
    '/documentos',
    '/confirmar-ciencia',
  ]) assert.match(source, new RegExp(action.replace('/', '\\/')));
});

test('dados de emergência permanecem separados por permissão', () => {
  const controller = read('modules/colaboradores/colaboradores.controller.js');
  const permissions = read('modules/colaboradores/colaboradores.permissions.js');
  const view = read('views/colaboradores/show.ejs');

  assert.match(controller, /maskEmergencyDetails/);
  assert.match(controller, /perms\.canViewEmergencyDetails/);
  assert.match(permissions, /function canViewEmergencyDetails/);
  assert.match(view, /activeTab==='saude' && canViewEmergencyDetails/);
});

test('layout de colaboradores é responsivo e tabela vira leitura móvel', () => {
  const css = read('public/css/colaboradores.css');

  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /\.colab-table td::before/);
  assert.match(css, /\.colab-profile-hero/);
  assert.match(css, /\.colab-tabs/);
});
