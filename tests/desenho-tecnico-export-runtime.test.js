const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../public/js/cad-mlight-runtime.js'), 'utf8');
const settle = () => new Promise(setImmediate);
const response = (ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => ({ ok }) });

// Run the actual runtime and its registered events with a minimal DOM/network
// adapter. CAD geometry and PDF output are covered by the native-entities suite.
async function bootRuntime(fetch) {
  const elements = new Map();
  class Element {
    constructor() { this.dataset = {}; this.events = {}; this.attrs = {}; this.classList = { add() {} }; }
    set innerHTML(html) {
      for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
        const element = new Element();
        element.href = match[0].match(/\bhref="([^"]+)"/)?.[1];
        elements.set(match[1], element);
      }
    }
    addEventListener(name, handler) { (this.events[name] ||= []).push(handler); }
    setAttribute(name, value) { this.attrs[name] = value; }
    removeAttribute(name) { delete this.attrs[name]; }
    appendChild() {}
    querySelector() { return null; }
    async click() {
      const event = { prevented: false, preventDefault() { this.prevented = true; } };
      await Promise.all((this.events.click || []).map((handler) => handler(event)));
      return event;
    }
  }
  const document = {
    querySelector: () => null, querySelectorAll: () => [],
    createElement: () => new Element(), getElementById: (id) => elements.get(id),
    head: new Element(), body: new Element(), documentElement: new Element()
  };
  const opened = [];
  let revision = 1;
  const app = { serializeForSave: () => ({ objects: [], dimensions: [{ id: `dim-${revision}` }], history: [] }) };
  const window = {
    CAD_INITIAL: { desenhoId: 17, data: {} },
    location: { assign: (url) => opened.push(url) },
    addEventListener() {}, dispatchEvent() {}
  };
  const loadModule = async (name) => name.includes('core.js')
    ? { MLIGHTCAD_VERSION: 'test', createMlightCadWorkbench: async () => app }
    : name.includes('auto-dimension')
      ? { createMlightAutoDimensionTools: () => ({}) }
      : { createMlightManufacturingTools: () => ({}) };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('document', 'window', 'fetch', 'loadModule', 'CustomEvent', 'console', source.replace(/\bimport\(/g, 'loadModule('))(
    document, window, fetch, loadModule, class {}, { error() {} }
  );
  assert.equal(window.CAD_MLIGHT_READY, true);
  return { elements, opened, setRevision: (value) => { revision = value; } };
}

test('PDF click waits for successful save, prevents default navigation and suppresses double clicks', async () => {
  let finish;
  const requests = [];
  const runtime = await bootRuntime((url, options) => {
    requests.push({ url, ...options });
    return new Promise((resolve) => { finish = resolve; });
  });
  const link = runtime.elements.get('mlightPdfExportBtn');
  const first = link.click();
  await settle();
  await link.click();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/desenho-tecnico/cad/17');
  assert.equal(JSON.parse(requests[0].body).dimensions[0].id, 'dim-1');
  assert.deepEqual(runtime.opened, []);
  assert.equal(link.attrs['aria-busy'], 'true');
  finish(response());
  assert.equal((await first).prevented, true);
  assert.deepEqual(runtime.opened, ['/desenho-tecnico/cad/17/pdf']);
  assert.equal(link.attrs['aria-busy'], undefined);
});

test('PDF requested during a previous save takes a fresh snapshot after that save', async () => {
  const pending = [];
  const runtime = await bootRuntime((_url, options) => new Promise((resolve) => pending.push({ resolve, data: JSON.parse(options.body) })));
  const first = runtime.elements.get('mlightSaveBtn').click();
  await settle();
  runtime.setRevision(2);
  const exporting = runtime.elements.get('mlightPdfExportBtn').click();
  await settle();
  assert.equal(pending.length, 1);
  pending[0].resolve(response());
  await first;
  await settle();
  assert.equal(pending.length, 2);
  assert.equal(pending[1].data.dimensions[0].id, 'dim-2');
  assert.deepEqual(runtime.opened, []);
  pending[1].resolve(response());
  await exporting;
  assert.equal(runtime.opened.length, 1);
});

for (const [name, failure] of [
  ['HTTP error', async () => response(false)],
  ['network error', async () => { throw new Error('offline'); }],
  ['login/HTML response', async () => ({ ok: true, status: 200, json: async () => { throw new Error('HTML'); } })]
]) {
  test(`failed save (${name}) prevents PDF navigation and permits a later retry`, async () => {
    let attempt = 0;
    const runtime = await bootRuntime(() => ++attempt === 1 ? failure() : response());
    const link = runtime.elements.get('mlightPdfExportBtn');
    await link.click();
    assert.deepEqual(runtime.opened, []);
    assert.equal(runtime.elements.get('mlightSaveState').dataset.state, 'error');
    await link.click();
    assert.deepEqual(runtime.opened, ['/desenho-tecnico/cad/17/pdf']);
  });
}
