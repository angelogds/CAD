const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('PCM prioriza indicadores essenciais e recolhe os complementares', () => {
  const view = read('views/ferramental/index.ejs');
  assert.match(view, /tool-kpis--primary/);
  assert.match(view, /Ver indicadores complementares/);
  assert.match(view, /tool-kpis--secondary/);
  assert.match(view, /tool-section-nav/);
});

test('cadastros do PCM ficam compactos e abrem sob demanda', () => {
  const view = read('views/ferramental/index.ejs');
  assert.match(view, /tool-registration-hub/);
  assert.match(view, /<details class="tool-compact-action" id="responsaveis">/);
  assert.match(view, /<details class="tool-compact-action" id="armarios">/);
  assert.match(view, /<details class="tool-compact-action" id="ferramentas">/);
  assert.match(view, /<details class="tool-compact-action" id="custodia">/);
  assert.match(view, /Ao registrar a entrega/);
});

test('PCM orienta apuração antes de eventual ressarcimento', () => {
  const view = read('views/ferramental/index.ejs');
  assert.match(view, /Responsabilidade, perda\/dano e eventual ressarcimento/);
  assert.match(view, /não presuma divisão automática do prejuízo/);
  assert.match(view, /validação de RH\/jurídico/);
  assert.match(view, /não substitui a apuração do caso concreto/);
});

test('Meu Portal conduz o aceite em quatro etapas com responsabilidade compartilhada', () => {
  const view = read('views/meu-portal/ferramental.ejs');
  ['1','2','3','4'].forEach((n) => assert.match(view, new RegExp('tool-accept-step__number">'+n)));
  assert.match(view, /Ferramenta compartilhada/);
  assert.match(view, /responsaveis_nomes/);
  assert.match(view, /uso, guarda, conservação e comunicação imediata/);
  assert.match(view, /não significa concordância com desconto automático em salário/);
});

test('selfie permanece evidência simples e assinatura continua obrigatória', () => {
  const view = read('views/meu-portal/ferramental.ejs');
  const js = read('public/js/ferramental-aceite.js');
  assert.match(view, /não há reconhecimento facial automatizado/);
  assert.match(view, /data-selfie-input/);
  assert.match(view, /data-selfie-preview/);
  assert.match(view, /data-signature-canvas/);
  assert.match(js, /URL\.createObjectURL/);
  assert.match(js, /A assinatura é obrigatória para confirmar/);
  assert.match(js, /Registrando aceite/);
});

test('termo revisado fica versionado e responsabilidade compartilhada é exposta pelo serviço', () => {
  const service = read('modules/ferramental/ferramental.aceite.service.js');
  assert.match(service, /ACCEPTANCE_TERM_VERSION = 'V2-RESP-2026-10'/);
  assert.match(service, /total_responsaveis/);
  assert.match(service, /responsaveis_nomes/);
  assert.match(service, /aceite_termo_versao=\?/);
  assert.match(service, /ACCEPTANCE_TERM_VERSION/);
});

test('PDF registra versão do termo e afasta interpretação de desconto automático', () => {
  const pdf = read('modules/ferramental/ferramental.pdf.js');
  assert.match(pdf, /aceite_termo_versao/);
  assert.match(pdf, /não representa autorização de desconto salarial automático/);
  assert.match(pdf, /não constitui desconto salarial automático/i);
  assert.match(pdf, /Ferramentas compartilhadas/);
});

test('arquivos JavaScript revisados permanecem sintaticamente válidos', () => {
  [
    'modules/ferramental/ferramental.aceite.service.js',
    'modules/ferramental/ferramental.pdf.js',
    'public/js/ferramental-aceite.js',
  ].forEach((file) => {
    execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
  });
});
