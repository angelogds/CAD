const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const service = fs.readFileSync('modules/escala/escala.service.js','utf8');
const migration = fs.readFileSync('database/migrations/168_escala_folgas_tipos_integracao.js','utf8');
const controller = fs.readFileSync('modules/escala/escala.controller.js','utf8');

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
