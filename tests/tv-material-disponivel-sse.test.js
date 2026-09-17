const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('almoxarifado publica material_disponivel somente para solicitação vinculada a OS', () => {
  const controller = read('modules/almoxarifado/almoxarifado.controller.js');

  assert.match(controller, /require\("node:crypto"\)/);
  assert.match(controller, /require\("\.\.\/alerts\/alerts\.hub"\)/);
  assert.match(controller, /if \(!sol\?\.os_id\) return false/);
  assert.match(controller, /const eventId = `almox-\$\{randomUUID\(\)\}`/);
  assert.match(controller, /alertsHub\.publish\("material_disponivel"/);
  assert.match(controller, /os_id: Number\(sol\.os_id\)/);
  assert.match(controller, /material: item\.item_nome_exibicao/);
  assert.match(controller, /quantidade_recebida:/);
  assert.match(controller, /quantidade_disponivel:/);
  assert.match(controller, /local_estoque:/);
});

test('evento é publicado depois do recebimento e não pode desfazer a entrada física', () => {
  const controller = read('modules/almoxarifado/almoxarifado.controller.js');
  const receiveAt = controller.indexOf('const resultado = service.receberItem');
  const publishAt = controller.indexOf('publicarMaterialDisponivel({ solicitacaoId', receiveAt);

  assert.ok(receiveAt >= 0);
  assert.ok(publishAt > receiveAt);
  assert.match(controller, /catch \(error\) \{[\s\S]*\[ALMOX\]\[TV\]/);
});

test('Modo TV reutiliza o EventSource existente e não cria rede paralela', () => {
  const script = read('public/js/tv-material-alerts.js');

  assert.match(script, /window\.CGTVTest\?\.state\?\.stream/);
  assert.match(script, /source\.addEventListener\('material_disponivel'/);
  assert.match(script, /core\.fetchSnapshot\(\{ detectNew: false \}\)/);
  assert.doesNotMatch(script, /new EventSource/);
  assert.doesNotMatch(script, /fetch\s*\(/);
  assert.doesNotMatch(script, /\/api\/tv\//);
});

test('reconexão troca o listener para o EventSource atual sem manter o anterior preso', () => {
  const script = read('public/js/tv-material-alerts.js');

  assert.match(script, /state\.source\.removeEventListener\('material_disponivel', onMaterialEvent\)/);
  assert.match(script, /source\.addEventListener\('material_disponivel', onMaterialEvent\)/);
  assert.ok(script.indexOf("removeEventListener('material_disponivel'") < script.indexOf("source.addEventListener('material_disponivel'"));
});

test('alerta de material separa fila pendente de eventos realmente exibidos', () => {
  const script = read('public/js/tv-material-alerts.js');
  const enqueueAt = script.indexOf('function enqueue(material)');
  const markShownAt = script.indexOf('function markShown(material)');
  const showAt = script.indexOf('function showNextMaterialAlert()');
  const processedAt = script.indexOf('state.processed.set(key, Date.now())', markShownAt);

  assert.match(script, /pending: new Set\(\)/);
  assert.match(script, /state\.pending\.add\(key\)/);
  assert.match(script, /state\.pending\.delete\(key\)/);
  assert.ok(enqueueAt >= 0);
  assert.ok(markShownAt >= 0);
  assert.ok(showAt >= 0);
  assert.ok(processedAt > markShownAt);
  assert.ok(markShownAt < showAt);
  assert.match(script, /markShown\(state\.current\)/);
});

test('alerta de material possui deduplicação e prioridade para alerta de nova OS', () => {
  const script = read('public/js/tv-material-alerts.js');

  assert.match(script, /cgTvProcessedMaterials/);
  assert.match(script, /state\.processed\.has\(key\)/);
  assert.match(script, /state\.pending\.has\(key\)/);
  assert.match(script, /function interruptForOS\(\)/);
  assert.match(script, /state\.queue\.unshift\(interrupted\)/);
  assert.match(script, /MutationObserver/);
});

test('assistente anuncia OS, material, quantidade, equipamento e local de retirada', () => {
  const script = read('public/js/tv-material-alerts.js');
  const sandbox = {
    window: {},
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
    },
    localStorage: { getItem() { return null; }, setItem() {} },
    MutationObserver: class { observe() {} },
    setInterval() { return 1; },
    setTimeout() { return 1; },
    clearTimeout() {},
    console,
  };

  vm.runInNewContext(script, sandbox);
  const message = sandbox.window.CGTVMaterialAlerts.buildVoiceMessage({
    os_id: 292,
    numero: 'OS #292',
    responsavel: 'Salviano, Luiz',
    material: 'Rolamento 22218',
    quantidade_recebida: 2,
    unidade: 'UN',
    equipamento: 'Digestor 3',
    local_estoque: 'Prateleira A',
    recebimento_parcial: false,
  });

  assert.match(message, /Salviano e Luiz/);
  assert.match(message, /OS número 292/);
  assert.match(message, /Rolamento 22218/);
  assert.match(message, /2 unidades/);
  assert.match(message, /Digestor 3/);
  assert.match(message, /Prateleira A/);
  assert.match(message, /disponível para retirada/i);
});

test('view carrega o alerta visual e a extensão depois do núcleo do Modo TV', () => {
  const view = read('views/tv/modo-tv.ejs');
  const css = read('public/css/tv-material-alerts.css');

  assert.match(view, /id="tvMaterialAlert"/);
  assert.match(view, /MATERIAL DISPONÍVEL NO ALMOXARIFADO/);
  assert.ok(view.indexOf('/js/tv-material-alerts.js') > view.indexOf('/js/tv-mode.js'));
  assert.match(view, /\/css\/tv-material-alerts\.css/);
  assert.match(css, /\.tv-material-alert/);
  assert.match(css, /#tvMaterialDetails/);
});
