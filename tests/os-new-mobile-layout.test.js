const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const view = fs.readFileSync(path.join(root, 'views/os/new.ejs'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/os-new.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public/js/os-new.js'), 'utf8');

test('Nova OS preserva fluxo, voz, mídia e endpoint de criação', () => {
  assert.match(view, /method="POST" action="\/os"/);
  assert.match(view, /enctype="multipart\/form-data"/);
  assert.match(view, /name="abertura_fotos"/);
  assert.match(view, /accept="image\/\*,video\/\*"/);
  assert.match(js, /fetch\('\/os\/voice\/analyze'/);
  assert.match(view, /Converse com o Mecânico/);
});

test('Nova OS possui blocos operacionais e ação principal curta', () => {
  for (const title of ['1. Identificação', '2. Solicitação', '3. Ocorrência', '4. Assistência técnica', '5. Evidências', '6. Ações da ordem de serviço']) {
    assert.equal(view.includes(title), true, `bloco ausente: ${title}`);
  }
  assert.match(view, />Salvar e gerar OS<\/button>/);
  assert.equal(view.includes('Salvar e gerar OS automática'), false);
});

test('Mobile reserva safe-area e posiciona assistente no canto sem sobrepor ações', () => {
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /ai-voice-global--new-os/);
  assert.match(css, /padding-bottom:calc\(92px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /os-new-submit\{width:100%;min-width:0;order:1;/);
  assert.match(js, /classList\.add\('ai-voice-global--new-os'\)/);
});

test('Submissão evita duplo envio e informa estado de geração', () => {
  assert.match(js, /if \(isSubmitting\)/);
  assert.match(js, /submitBtn\.disabled = true/);
  assert.match(js, /submitBtn\.textContent = 'Gerando OS\.\.\.'/);
  assert.match(js, /window\.addEventListener\('pageshow', resetSubmitState\)/);
  assert.match(js, /scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/);
});
