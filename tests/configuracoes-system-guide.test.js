const test = require('node:test');
const assert = require('node:assert/strict');
const { getGuideForRole } = require('../modules/meu-portal/system-guide');

test('guia de módulos acompanha o RBAC real do perfil', () => {
  const admin = getGuideForRole('ADMIN');
  const mecanico = getGuideForRole('MECANICO');
  const compras = getGuideForRole('COMPRAS');

  assert.ok(admin.some((item) => item.key === 'usuarios'));
  assert.ok(admin.some((item) => item.key === 'pcm'));

  assert.ok(mecanico.some((item) => item.key === 'os'));
  assert.ok(mecanico.some((item) => item.key === 'preventivas'));
  assert.ok(mecanico.some((item) => item.key === 'meu-portal'));
  assert.equal(mecanico.some((item) => item.key === 'compras'), false);
  assert.equal(mecanico.some((item) => item.key === 'rh'), false);

  assert.ok(compras.some((item) => item.key === 'compras'));
  assert.ok(compras.some((item) => item.key === 'estoque'));
  assert.equal(compras.some((item) => item.key === 'pcm'), false);
});

test('guia remove capacidades não autorizadas mesmo quando o módulo é visível', () => {
  const mecanicoOs = getGuideForRole('MECANICO').find((item) => item.key === 'os');
  const diretoriaEquipamentos = getGuideForRole('DIRETORIA').find((item) => item.key === 'equipamentos');

  assert.ok(mecanicoOs.actions.includes('Executar, registrar andamento e fechar serviços'));
  assert.equal(diretoriaEquipamentos.actions.includes('Cadastrar e atualizar dados técnicos'), false);
  assert.ok(diretoriaEquipamentos.actions.includes('Consultar equipamentos e histórico'));
});
