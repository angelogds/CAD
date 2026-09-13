const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const service = fs.readFileSync('modules/escala/escala.service.js','utf8');
const migration = fs.readFileSync('database/migrations/168_escala_folgas_tipos_integracao.js','utf8');
const controller = fs.readFileSync('modules/escala/escala.controller.js','utf8');
const routes = fs.readFileSync('modules/escala/escala.routes.js','utf8');
const folgaController = fs.readFileSync('modules/escala/escala.folga.controller.js','utf8');
const folgasView = fs.readFileSync('views/escala/folgas-programadas.ejs','utf8');
const osView = fs.readFileSync('views/os/show.ejs','utf8');
const pdf = fs.readFileSync('modules/escala/escala.pdf.js','utf8');

test('tipos não compensatórios são normalizados e não debitam o banco',()=>{
  for (const tipo of ['FOLGA_MANUAL','ATESTADO','FERIAS','FALTA_JUSTIFICADA','FALTA_NAO_JUSTIFICADA','OUTRO']) assert.match(service,new RegExp(`'${tipo}'`));
  assert.match(service,/const debita=tipo==='FOLGA_COMPENSATORIA'/);
  assert.match(service,/const minutos=debita\?Number\(dados\.minutos_descontados\):0/);
});
test('compensatória registra saldos e cancelamento idempotente',()=>{
  assert.match(service,/saldo_antes_minutos,saldo_depois_minutos/);
  assert.match(service,/DEBITO_FOLGA/);
  assert.match(service,/debitado&&!estorno/);
  assert.match(service,/realizado_em=datetime\('now'\)/);
});
test('afastamentos sobrepostos são recusados e período bloqueia disponibilidade',()=>{
  assert.match(service,/afastamento ativo sobreposto/);
  assert.match(service,/NOT \(COALESCE\(data_fim,data_folga\) < \? OR data_folga > \?\)/);
});
test('migração preserva dados e inclui todos os campos integradores',()=>{
  for(const field of ['tipo_lancamento','data_fim','data_servico','hora_inicio','hora_fim','equipamento','descricao_servico','anexo_path','debita_banco','saldo_antes_minutos','saldo_depois_minutos','concessao_id','ausencia_id','realizado_em']) assert.match(migration,new RegExp(field));
  assert.doesNotMatch(migration,/DROP TABLE|DELETE FROM/);
});
test('dispatcher diferencia todas as opções de relatório',()=>{
  for(const tipo of ['completa','semana','funcionario','os','folgas','ausencias','mensal']) assert.match(controller,new RegExp(`tipo==='${tipo}'`));
});

test('folga compensatória administrativa busca OS e horas extras aprovadas do serviço',()=>{
  assert.match(service,/function listarHorasExtrasParaCompensacao/);
  assert.match(service,/function formatarHoraServico/);
  assert.match(service,/hora_inicio:\s*formatarHoraServico\(primeiroInicio\)/);
  assert.match(service,/status:\s*'APROVADO'/);
  assert.match(service,/data_servico:\s*dataServico/);
  assert.match(folgaController,/horasExtrasServico/);
  assert.match(routes,/\/folgas\/horas-extras-servico/);
  assert.match(folgasView,/data-compensacao-url="\/escala\/folgas\/horas-extras-servico"/);
  assert.match(folgasView,/id="compensacao-os-list"/);
  assert.match(folgasView,/id="dataServico"/);
  assert.match(folgasView,/fetch\(url/);
});

test('relatório e tela da OS mostram horas feitas e onde foram prestadas',()=>{
  assert.match(pdf,/Onde foi prestada/);
  assert.match(pdf,/h\.equipamento_nome \|\| h\.os_equipamento/);
  assert.match(osView,/Onde foi prestada:/);
  assert.match(osView,/he\.equipamento_nome \|\| he\.os_equipamento/);
});
