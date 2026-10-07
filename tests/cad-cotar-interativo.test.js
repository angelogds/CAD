const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const view = read('views/desenho-tecnico/cad-editor-v2.ejs');
const dimensionTool = read('public/js/modules/desenho-tecnico/tools/dimension.tool.js');
const dimensionEntity = read('public/js/modules/desenho-tecnico/entities/dimension.entity.js');
const selectTool = read('public/js/modules/desenho-tecnico/tools/select.tool.js');
const renderer = read('public/js/modules/desenho-tecnico/desenho-tecnico.renderer.js');
const controller = read('public/js/modules/desenho-tecnico/desenho-tecnico.controller.js');
const pdfService = read('modules/desenho-tecnico/desenho-tecnico.pdf.service.js');

test('Anotar oferece botão Cotar sem remover cotas especializadas', () => {
  assert.match(view, /data-action="tool-cotar" data-tool="dim_linear"[^>]*>[\s\S]*?<span>Cotar<\/span>/);
  assert.match(view, /data-action="tool-dim-linear"/);
  assert.match(view, /data-action="tool-dim-diameter"/);
  assert.match(view, /data-action="tool-dim-angular"/);
});

test('Cotar usa três etapas e salva a posição real da linha de cota', () => {
  assert.match(dimensionTool, /this\.a = null/);
  assert.match(dimensionTool, /this\.b = null/);
  assert.match(dimensionTool, /dimensionLinePoint:/);
  assert.match(dimensionTool, /Puxe a cota para fora da peça/);
  assert.match(dimensionTool, /dimension-preview/);
  assert.match(dimensionTool, /buildLinearGeometry\(p1, p2, placement,[\s\S]*?'diameter'\)/);
});

test('cota pode ser reposicionada sem deslocar os pontos medidos', () => {
  assert.match(dimensionEntity, /\['dimensionLinePoint', 'textPoint'\]/);
  const moveBlock = dimensionEntity.slice(dimensionEntity.indexOf('move(dx, dy)'));
  assert.doesNotMatch(moveBlock, /\['p1', 'p2'/);
  assert.match(selectTool, /role: 'dimensionLinePoint'/);
  assert.match(selectTool, /g\.dimensionLinePoint = \{ x: p\.x, y: p\.y \}/);
});

test('renderer desenha linha de cota deslocada, extensões, setas e preview', () => {
  assert.match(renderer, /renderLinearDimension/);
  assert.match(renderer, /layout\.dimensionStart/);
  assert.match(renderer, /layout\.dimensionEnd/);
  assert.match(renderer, /<polygon points=/);
  assert.match(renderer, /p\.type === 'dimension-preview'/);

  const shaftStart = renderer.indexOf('renderShaft(g, e, stroke)');
  const shaftEnd = renderer.indexOf('renderLinearDimension', shaftStart);
  const shaftBlock = renderer.slice(shaftStart, shaftEnd);
  assert.doesNotMatch(shaftBlock, /strokeWidth|\$\{dash\}/);
});

test('inspetor permite editar cor espessura e tipo de linha do objeto selecionado', () => {
  assert.match(controller, /data-style-prop='color'/);
  assert.match(controller, /data-style-prop='strokeWidth'/);
  assert.match(controller, /data-style-prop='lineType'/);
  assert.match(controller, /DASHED/);
  assert.match(controller, /DASHDOT/);
  assert.match(controller, /entity\.style\.lineWeight = Math\.round\(width \* 10\)/);
});

test('salvar e exportar PDF preservam cotas e estilos', () => {
  assert.match(controller, /dimensions: objects\.filter\(\(o\) => o\.type === 'dimension'\)/);
  const exportStart = controller.indexOf("'export-pdf': async");
  const exportBlock = controller.slice(exportStart, exportStart + 900);
  assert.ok(exportBlock.indexOf('await this.saveDrawing()') >= 0);
  assert.ok(exportBlock.indexOf('window.location.assign') > exportBlock.indexOf('await this.saveDrawing()'));

  assert.match(pdfService, /resolveCadStrokeStyle/);
  assert.match(pdfService, /applyCadStroke/);
  assert.match(pdfService, /dimensionPdf\.renderDimensionToPdf/);
});

test('serviço CommonJS de PDF alterado permanece sintaticamente válido', () => {
  execFileSync(process.execPath, ['--check', path.join(root, 'modules/desenho-tecnico/desenho-tecnico.pdf.service.js')], { stdio: 'pipe' });
});
