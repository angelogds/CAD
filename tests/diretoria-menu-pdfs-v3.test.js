const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('relatório institucional aceita contexto próprio sem quebrar padrão de banco de horas', () => {
  const source = read('utils/pdf/institutional-report.js');
  assert.match(source, /headerContext = 'Banco de horas \| Manutenção Campo do Gado'/);
  assert.match(source, /footerText = 'Manutenção Campo do Gado - Documento para controle interno de banco de horas e folgas\.'/);
  assert.match(source, /subject = 'Controle interno de banco de horas'/);
  assert.match(source, /write\(\[headerContext \|\| 'Manutenção Campo do Gado'\]/);
  assert.match(source, /write\(\[footerText \|\| 'Manutenção Campo do Gado - Documento interno\.'/);
});

test('PDF semanal da Escala usa o mesmo relatório institucional compartilhado', () => {
  const pdf = read('modules/escala/escala.weekly-pdf.js');
  const controller = read('modules/escala/escala.weekly-pdf.controller.js');
  const routes = read('modules/escala/escala.routes.js');

  assert.match(pdf, /pdfStandard\.createReport/);
  assert.match(pdf, /Escala Semanal – Manutenção Industrial/);
  assert.match(pdf, /headerContext: 'Escala semanal \| Manutenção Campo do Gado'/);
  assert.match(pdf, /report\.summary/);
  assert.match(pdf, /title: 'Escala semanal'/);
  assert.match(pdf, /title: 'Folgas e cobertura de sábado'/);
  assert.doesNotMatch(pdf, /new PDFDocument/);

  assert.match(controller, /service\.getEscalaSemanalPdfData\(\)/);
  assert.match(controller, /service\.listarFolgasSabado\(\)/);
  assert.match(controller, /Number\(item\.semana_id\) === semanaId/);
  assert.match(routes, /weeklyPdfController = require\("\.\/escala\.weekly-pdf\.controller"\)/);
  assert.match(routes, /safe\(weeklyPdfController\.pdfSemana, "pdfSemana"\)/);
  assert.match(routes, /safe\(weeklyPdfController\.pdfSemanaById, "pdfSemanaById"\)/);
});

test('PDF de Desempenho da Manutenção usa a camada executiva e os novos indicadores', () => {
  const controller = read('modules/diretoria/diretoria.controller.js');
  const routes = read('modules/diretoria/diretoria.routes.js');

  assert.match(controller, /function manutencaoPdf/);
  assert.match(controller, /manutencaoExecutivaService\.getDashboard\(req\.query/);
  assert.match(controller, /pdfStandard\.createReport/);
  assert.match(controller, /title: 'Desempenho da Manutenção'/);
  assert.match(controller, /title: 'Indicadores executivos'/);
  assert.match(controller, /title: 'Backlog de OS por idade'/);
  assert.match(controller, /title: 'Equipamentos com corretivas reincidentes'/);
  assert.match(controller, /title: 'Qualidade dos dados para confiabilidade'/);
  assert.match(controller, /indicador: 'MTBF'/);
  assert.match(controller, /indicador: 'MTTR'/);
  assert.match(controller, /indicador: 'Disponibilidade'/);
  assert.match(controller, /MTBF, MTTR e disponibilidade são liberados automaticamente/);
  assert.match(controller, /desempenho-manutencao\.pdf/);
  assert.match(routes, /router\.get\('\/manutencao\/pdf',[\s\S]*ctrl\.manutencaoPdf\)/);
});

test('módulos executivos ficam em Operação e não existe mais link para hub da Diretoria', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  const operationsStart = sidebar.indexOf('OPERAÇÃO');
  const supportStart = sidebar.indexOf('GESTÃO E APOIO');
  const maintenance = sidebar.indexOf("'/dashboard/diretoria/manutencao'");
  const purchases = sidebar.indexOf("'/dashboard/diretoria/compras'");

  assert.ok(operationsStart >= 0);
  assert.ok(maintenance > operationsStart && maintenance < supportStart);
  assert.ok(purchases > maintenance && purchases < supportStart);
  assert.doesNotMatch(sidebar, /Painel da Diretoria/);
});
