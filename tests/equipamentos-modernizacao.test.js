const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const service = fs.readFileSync('modules/equipamentos/equipamentos.service.js','utf8');
const controller = fs.readFileSync('modules/equipamentos/equipamentos.controller.js','utf8');
const view = fs.readFileSync('views/equipamentos/index.ejs','utf8');
const form = fs.readFileSync('views/equipamentos/form.ejs','utf8');
const migration = fs.readFileSync('database/migrations/184_equipamentos_painel_moderno.js','utf8');
test('painel usa filtros parametrizados, paginação backend e indicadores reais',()=>{
 assert.match(service,/LIMIT @limit OFFSET @offset/); assert.match(service,/OPEN_OS_SQL/); assert.match(service,/COUNT\(\*\) total/);
 assert.match(view,/Equipamentos que exigem atenção/); assert.match(view,/Mostrando/); assert.match(view,/Distribuição por criticidade/);
});
test('formulário compartilhado cobre cadastro técnico e validação backend',()=>{
 for(const field of ['codigo','nome','setor','tipo']) assert.ok(form.includes(`['${field}'`) || form.includes(`,'${field}'`));
 for(const field of ['status_operacional','possui_plano_preventivo','documento_tecnico']) assert.match(form,new RegExp(`name=\"${field}\"`));
 assert.match(controller,/service\.codeExists/); assert.match(controller,/status: 422/); assert.match(form,/Salvar e abrir ficha/);
});
test('migração é aditiva e preserva situação cadastral separada',()=>{
 assert.doesNotMatch(migration,/DROP TABLE|DELETE FROM equipamentos/); assert.match(migration,/status_operacional/); assert.match(migration,/possui_plano_preventivo/);
});
