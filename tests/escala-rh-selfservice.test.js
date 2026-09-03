const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('RBAC separa escala geral, RH, gestão e autoatendimento', () => {
  const source = read('config/rbac.js');
  assert.match(source, /escala_self:\s*\[[^\]]*ROLE\.COLABORADOR/s);
  assert.match(source, /escala_rh:\s*\[[^\]]*ROLE\.RH/s);
  assert.match(source, /escala_manage:/);
  assert.match(source, /escala_reports:/);
});

test('rotas expõem painéis específicos sem liberar a escala completa ao colaborador', () => {
  const source = read('modules/escala/escala.routes.js');
  assert.match(source, /router\.get\("\/meu-painel"[^\n]*escalaSelfRead/);
  assert.match(source, /router\.get\("\/rh"[^\n]*escalaRhRead/);
  assert.match(source, /router\.get\("\/semana"[^\n]*escalaRead/);
  assert.match(source, /router\.get\("\/banco-horas"[^\n]*escalaSelfRead/);
  assert.match(source, /role === ROLE\.COLABORADOR[^\n]*\/escala\/meu-painel/);
});

test('painel pessoal força consulta apenas do próprio colaborador', () => {
  const source = read('modules/escala/escala.self.controller.js');
  assert.match(source, /buscarColaboradorDoUsuario\(user\.id\)/);
  assert.match(source, /canViewAll:\s*false/);
  assert.match(source, /listarBancoHoras\(\{ colaborador_id: colaborador\.id \}\)/);
  assert.match(source, /listarHorasExtras\(\{ colaborador_id: colaborador\.id \}\)/);
});

test('painel RH usa visão consolidada somente de leitura', () => {
  const source = read('modules/escala/escala.rh.controller.js');
  assert.match(source, /listarPainelEscala\(\{ user: currentUser\(req\), canViewAll: true \}\)/);
  assert.match(source, /horasExtrasMesMinutos/);
  assert.match(source, /bancoHorasMinutos/);
  assert.doesNotMatch(source, /aprovarHoraExtra|salvarConfiguracaoRodizio|programarFolgaCompensatoria/);
});

test('telas oferecem ficha, banco, PDF e histórico pessoal', () => {
  const rh = read('views/escala/rh.ejs');
  const self = read('views/escala/meu-painel.ejs');
  assert.match(rh, /\/colaboradores\/<%= c\.id %>/);
  assert.match(rh, /\/escala\/banco-horas\/<%= c\.id %>/);
  assert.match(rh, /\/escala\/relatorios\/funcionario\/<%= c\.id %>\/pdf/);
  assert.match(self, /Movimentos recentes do banco/);
  assert.match(self, /Horas extras recentes/);
  assert.match(self, /Folgas e ausências/);
});
