const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('controller consolida criticidade em engenharia e backlog na programação', () => {
  const src = fs.readFileSync('modules/pcm/pcm.controller.js', 'utf8');
  assert.match(src, /function engenharia[\s\S]*criticidadeAtual/);
  assert.match(src, /function salvarCriticidade[\s\S]*\/pcm\/engenharia\?equipamento_id=/);
  assert.match(src, /function programacaoSemanal[\s\S]*atividadesSemProgramacao/);
  assert.ok(!src.includes('res.render("pcm/backlog"'));
  assert.ok(!src.includes('res.render("pcm/criticidade"'));
});

test('classificação de falha e PDFs operacionais estão ligados ao controller', () => {
  const src = fs.readFileSync('modules/pcm/pcm.controller.js', 'utf8');
  for (const fn of ['classificarFalha', 'planejamentoPdf', 'pecasCriticasPdf', 'relatoriosAvancadosPdf', 'relatoriosAvancadosExcel']) {
    assert.ok(src.includes(`function ${fn}`), `função ausente: ${fn}`);
  }
});

test('plano assistido de lubrificação exige confirmação técnica', () => {
  const controller = fs.readFileSync('modules/pcm/pcm.controller.js', 'utf8');
  const service = fs.readFileSync('modules/pcm/pcm.service.js', 'utf8');
  const view = fs.readFileSync('views/pcm/lubrificacao.ejs', 'utf8');
  assert.ok(controller.includes("confirmacao_tecnica || '') !== '1'"));
  assert.ok(service.includes("schemaName: 'pcm_plano_lubrificacao_sugerido'"));
  assert.ok(service.includes('Não invente especificação do fabricante'));
  assert.ok(view.includes('name="confirmacao_tecnica"'));
  assert.ok(view.includes('required'));
});
