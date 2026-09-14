const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dateBr = require('../utils/data-hora-br');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('formata datas e horários no padrão brasileiro e em Brasília', () => {
  assert.equal(dateBr.formatDateBR('2026-09-03'), '03/09/2026');
  assert.equal(dateBr.formatDateTimeBR('2026-09-04T00:30:00Z'), '03/09/2026 21:30');
  assert.equal(dateBr.formatTimeBR('2026-09-04T00:30:00Z'), '21:30');
  assert.equal(dateBr.isMondayISO('2026-09-07'), true);
  assert.equal(dateBr.isMondayISO('2026-09-04'), false);
  assert.equal(dateBr.isMondayISO('2026-09-05'), false);
});

test('migration cria fila de solicitação, reserva única e data operacional de Brasília', () => {
  const migration = read('database/migrations/190_escala_folga_autoatendimento_timezone.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS escala_folga_solicitacoes/);
  assert.match(migration, /uidx_escala_folga_solic_data_pendente/);
  assert.match(migration, /WHERE status = 'PENDENTE_APROVACAO'/);
  assert.match(migration, /trg_escala_he_data_brasilia_insert/);
  assert.match(migration, /date\(NEW\.inicio_extra, '-3 hours'\)/);
});

test('solicitação é própria, aceita meio período com 3h30, bloqueia segunda e revalida na aprovação', () => {
  const service = read('modules/escala/escala.folga-solicitacao.service.js');
  assert.match(service, /MINUTOS_DIA_FOLGA = 480/);
  assert.match(service, /MINUTOS_MEIO_PERIODO_FOLGA = 240/);
  assert.match(service, /MINUTOS_MINIMOS_MEIO_PERIODO = 210/);
  assert.match(service, /function normalizarPeriodoFolga/);
  assert.match(service, /function saldoPermiteFolga/);
  assert.match(service, /buscarColaboradorDoUsuario\(userId\(user\)\)/);
  assert.match(service, /isMondayISO/);
  assert.match(service, /conflitoProgramadoNaData/);
  assert.match(service, /conflitoSolicitacaoNaData/);
  assert.match(service, /periodo_folga = 'DIA_TODO'/);
  assert.match(service, /assertSaldoPermiteFolga\(saldo, periodo\.minutos\)/);
  assert.match(service, /assertDataFolgaDisponivel\(solicitacao\.data_folga/);
  assert.match(service, /calcularSaldoBancoHoras\(solicitacao\.colaborador_id\)/);
  assert.match(service, /programarFolgaCompensatoria/);
});

test('rotas separam autoatendimento de aprovação da gestão', () => {
  const routes = read('modules/escala/escala.routes.js');
  assert.match(routes, /\/folgas\/solicitar[^\n]+escalaSelfRead/);
  assert.match(routes, /\/folgas\/solicitacoes\/:id\/cancelar[^\n]+escalaSelfRead/);
  assert.match(routes, /\/folgas\/solicitacoes\/:id\/aprovar[^\n]+escalaManage/);
  assert.match(routes, /\/folgas\/solicitacoes\/:id\/reprovar[^\n]+escalaManage/);
  assert.match(routes, /res\.locals\.dateBr = dateBr/);
});

test('views simplificam aprovação e exibem datas formatadas', () => {
  const he = read('views/escala/hora-extra-pendentes.ejs');
  const self = read('views/escala/meu-painel.ejs');
  const folgas = read('views/escala/folgas-programadas.ejs');
  const nova = read('views/escala/hora-extra-nova.ejs');
  assert.match(he, /dateBr\.formatDateBR\(h\.data_servico\)/);
  assert.match(he, /dateBr\.formatTimeBR\(h\.inicio_extra\)/);
  assert.doesNotMatch(he, /<%=\s*h\.inicio_extra\s*\|\|/);
  assert.match(he, /Fila de aprovação/);
  assert.match(he, /<details class="approval-details">/);
  assert.match(self, /Solicitar folga pelo Banco de Horas/);
  assert.match(self, /name="periodo_folga"/);
  assert.match(self, /Meio período libera com <strong>3h30<\/strong>/);
  assert.match(self, /self-leave-form--compact/);
  assert.match(self, /Segunda-feira/);
  assert.match(self, /Apenas 1 colaborador por dia|1 colaborador por dia/);
  assert.match(folgas, /Solicitações aguardando aprovação/);
  assert.match(folgas, /saldo fica até -0h30/);
  assert.match(folgas, /\/folgas\/solicitacoes\/<%= s\.id %>\/aprovar/);
  assert.match(nova, /dateBr\.formatDateTimeBR\(emAndamento\.inicio_extra\)/);
  assert.match(nova, /quick-os-grid/);
  assert.match(nova, /js-quick-os/);
});

test('interfaces públicas do RH e colaborador não expõem ADMIN como fluxo nominal', () => {
  const files = [
    'views/escala/meu-painel.ejs',
    'views/escala/folgas-programadas.ejs',
    'views/rh/index.ejs',
    'views/meu-portal/cartao.ejs',
    'views/meu-portal/dados-profissionais.ejs',
    'views/meu-portal/perfil.ejs',
    'views/meu-portal/rh.ejs',
    'views/meu-portal/treinamentos.ejs',
    'views/meu-portal/materiais.ejs',
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /RH\/ADMIN|administrador|administradores|Justificativa ADMIN|Aguardando ADMIN/);
  }
});
