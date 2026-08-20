const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const root = process.cwd();
const indexView = path.join(root, 'views', 'desenho-tecnico', 'index.ejs');
const cadEntry = path.join(root, 'public', 'js', 'cad-engine-v2.js');

function renderCentral(canManage = true) {
  return ejs.renderFile(indexView, {
    layout: () => '',
    canManage,
    filtros: { q: '', equipamento_id: '', status: '' },
    resumo: { total: 1, vinculados: 1, semVinculo: 0, comPdf: 1, recentes: 1 },
    equipamentos: [{ id: 9, codigo: 'EQ-009', nome: 'TRITURADOR FAST' }],
    lista: [{
      id: 41,
      codigo: 'CAD0041',
      titulo: 'Eixo principal do rotor',
      equipamento_id: 9,
      equipamento_nome: 'TRITURADOR FAST',
      material: 'SAE 1045',
      revisao: 2,
      status: 'ATIVO',
      atualizado_em: '2026-08-19 10:30:00',
      total_pdfs: 1,
    }],
  });
}

test('central de desenhos renderiza indicadores, filtros e arquivo técnico', async () => {
  const html = await renderCentral(true);
  assert.match(html, /Central de Desenhos Técnicos/);
  assert.match(html, /Todos os equipamentos/);
  assert.match(html, /CAD0041/);
  assert.match(html, /TRITURADOR FAST/);
  assert.match(html, /SAE 1045/);
  assert.match(html, /REV\. 2/);
  assert.match(html, /\/desenho-tecnico\/cad\/41\/editor/);
  assert.match(html, /\/desenho-tecnico\/cad\/41\/pdf/);
});

test('central respeita modo somente leitura para usuário sem gerenciamento', async () => {
  const html = await renderCentral(false);
  assert.doesNotMatch(html, /Novo desenho 2D/);
  assert.doesNotMatch(html, /\/desenho-tecnico\/cad\/41\/editor/);
  assert.doesNotMatch(html, /\/desenho-tecnico\/cad\/41\/pdf/);
  assert.match(html, /\/desenho-tecnico\/cad\/41/);
});

test('ribbon do CAD expõe ferramentas existentes sem criar nova geometria', () => {
  const source = fs.readFileSync(cadEntry, 'utf8');
  assert.match(source, /tool-mirror/);
  assert.match(source, /tool-dim-linear/);
  assert.match(source, /tool-dim-diameter/);
  assert.match(source, /tool-dim-angular/);
  assert.match(source, /tool-centerline/);
  assert.match(source, /tool-measure/);
  assert.match(source, /Mecânica/);
  assert.match(source, /Cotas e anotação/);
});
