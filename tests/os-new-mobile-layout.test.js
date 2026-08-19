const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const view = fs.readFileSync(path.join(root, 'views/os/new.ejs'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/os-new.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public/js/os-new.js'), 'utf8');

test('Nova OS preserva POST e foto opcional sem fluxo de voz', () => {
  assert.match(view, /method="POST" action="\/os"/);
  assert.match(view, /enctype="multipart\/form-data"/);
  assert.match(view, /name="abertura_fotos"/);
  assert.match(view, /accept="image\/\*"/);
  assert.match(view, /Foto de abertura \(opcional\)/);
  assert.doesNotMatch(view, /Converse com o Mecânico/);
  assert.doesNotMatch(view, /Assistência técnica/);
  assert.doesNotMatch(js, /\/os\/voice\/analyze/);
  assert.doesNotMatch(js, /SpeechRecognition/);
});

test('Nova OS possui somente os cinco blocos operacionais necessários', () => {
  for (const title of ['1. Identificação', '2. Solicitação', '3. Ocorrência', '4. Evidências', '5. Ações da ordem de serviço']) {
    assert.equal(view.includes(title), true, `bloco ausente: ${title}`);
  }
  assert.match(view, />Salvar e gerar OS<\/button>/);
});

test('Solicitação identifica contexto automaticamente e não exibe responsável editável', () => {
  assert.match(view, /name="setor_solicitante" value="Manutenção"/);
  assert.match(view, /name="setor_destinatario" value="Manutenção"/);
  assert.match(view, /name="responsavel_manutencao" value="Ângelo Gomes da Silva"/);
  assert.match(view, /<strong><%= user\?\.name \|\| 'Usuário autenticado' %><\/strong>/);
  assert.doesNotMatch(view, /for="responsavel_manutencao"/);
  assert.doesNotMatch(view, /type="text" name="responsavel_manutencao"/);
});

test('Assistente global fica oculto somente na Nova OS e mobile mantém safe-area', () => {
  assert.match(css, /ai-voice-global--hidden-new-os/);
  assert.match(css, /display:none!important/);
  assert.match(js, /classList\.add\('ai-voice-global--hidden-new-os'\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /os-new-submit\{width:100%;min-width:0;order:1;/);
});

test('Submissão escrita evita duplo envio e informa estado de geração', () => {
  assert.match(js, /if \(isSubmitting\)/);
  assert.match(js, /syncDescription\(\)/);
  assert.match(js, /submitBtn\.disabled = true/);
  assert.match(js, /submitBtn\.textContent = 'Gerando OS\.\.\.'/);
  assert.match(js, /window\.addEventListener\('pageshow', resetSubmitState\)/);
  assert.match(js, /scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/);
});
