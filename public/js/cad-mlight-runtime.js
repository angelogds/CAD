function ensureStyles() {
  if (document.querySelector('link[data-cad-mlight-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/cad-mlight.css?v=20260820-core-v1';
  link.dataset.cadMlightStyle = '1';
  document.head.appendChild(link);
}

function safeText(value, fallback = '') {
  return String(value ?? fallback).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function createShell(initial) {
  ensureStyles();
  const drawingId = Number(initial?.desenhoId || 0);
  if (!drawingId) throw new Error('Identificador do desenho não encontrado.');
  const data = initial?.data || {};
  const code = data.codigo || `CAD-${drawingId}`;
  const title = data.titulo || 'Desenho técnico 2D';

  const page = document.createElement('section');
  page.id = 'cadMlightPage';
  page.className = 'cad-mlight-page';
  page.innerHTML = `
    <header class="cad-mlight-appbar">
      <a class="cad-mlight-back" href="/desenho-tecnico/cad/${drawingId}" title="Voltar">←</a>
      <span class="cad-mlight-brand" aria-hidden="true">2D</span>
      <div class="cad-mlight-title">
        <small>CAD MECÂNICO • MLIGHTCAD CORE</small>
        <strong>${safeText(code)}</strong>
        <span>${safeText(title)}</span>
      </div>
      <span id="mlightCadStatus" class="cad-mlight-engine" data-state="loading">Inicializando motor…</span>
      <div class="cad-mlight-spacer"></div>
      <button id="mlightFlangeBtn" class="cad-mlight-action accent" type="button">◎ <span>Flange</span></button>
      <button id="mlightShaftBtn" class="cad-mlight-action accent" type="button">⇥ <span>Eixo</span></button>
      <button id="mlightDxfImportBtn" class="cad-mlight-action" type="button">⇧ <span>Abrir DXF</span></button>
      <button id="mlightDxfExportBtn" class="cad-mlight-action" type="button">⇩ <span>Exportar DXF</span></button>
      <a class="cad-mlight-action" href="/desenho-tecnico/cad/${drawingId}/pdf">PDF</a>
      <a class="cad-mlight-action" href="?engine=legacy" title="Abrir o motor anterior para contingência">Motor anterior</a>
      <span id="mlightSaveState" class="cad-mlight-save-state" data-state="saved">Tudo salvo</span>
      <button id="mlightSaveBtn" class="cad-mlight-action primary" type="button">Salvar desenho</button>
    </header>
    <main class="cad-mlight-main">
      <div id="mlightCadHost"><div id="mlightCadCanvas"></div></div>
      <div class="cad-mlight-floating-tools" aria-label="Ações de visualização">
        <button id="mlightZoomExtentsBtn" class="cad-mlight-action" type="button">Enquadrar tudo</button>
      </div>
      <div id="mlightFallbackCard" class="cad-mlight-fallback" hidden>
        <h2>Motor profissional indisponível</h2>
        <p>O editor anterior será carregado automaticamente para você não perder acesso ao desenho.</p>
      </div>
      <input id="mlightDxfInput" type="file" accept=".dxf,application/dxf" hidden>
    </main>
    <footer class="cad-mlight-statusbar">
      <form id="mlightCommandForm" autocomplete="off">
        <input id="mlightCommandInput" placeholder="Comando: LINE, PLINE, CIRCLE, ARC, HATCH, MOVE, COPY, ROTATE, OFFSET, DIMLINEAR…" aria-label="Linha de comando CAD">
      </form>
      <div class="cad-mlight-status-actions">
        <button class="cad-mlight-action" type="button" data-cad-command="undo">Desfazer</button>
        <button class="cad-mlight-action" type="button" data-cad-command="redo">Refazer</button>
        <button class="cad-mlight-action" type="button" data-cad-command="layer">Camadas</button>
      </div>
    </footer>`;
  document.body.appendChild(page);
  document.body.classList.add('cad-mlight-mode');
  return page;
}

function removeShell() {
  document.getElementById('cadMlightPage')?.remove();
  document.body.classList.remove('cad-mlight-mode');
}

function setStatus(message, state = 'ok') {
  const el = document.getElementById('mlightCadStatus');
  if (!el) return;
  el.textContent = message;
  el.dataset.state = state;
}

function setSaveState(message, state = 'saved') {
  const el = document.getElementById('mlightSaveState');
  if (!el) return;
  el.textContent = message;
  el.dataset.state = state;
}

async function boot() {
  const initial = window.CAD_INITIAL || {};
  const page = createShell(initial);
  const drawingId = Number(initial.desenhoId || 0);
  const cadData = initial.data || {};

  try {
    const { createMlightCadWorkbench, MLIGHTCAD_VERSION } = await import('/vendor/mlightcad/mlightcad-core.js');
    const app = await createMlightCadWorkbench({
      container: document.getElementById('mlightCadCanvas'),
      host: document.getElementById('mlightCadHost'),
      cadData,
      fileName: `${cadData.codigo || `CAD-${drawingId}`}.dxf`,
      onStatus: (message) => setStatus(message, 'ok')
    });
    window.CAD_MLIGHT_APP = app;
    window.CAD_MLIGHT_READY = true;
    document.documentElement.dataset.cadEngine = 'mlightcad';
    setStatus(`MLightCAD ${MLIGHTCAD_VERSION} • motor profissional ativo`, 'ok');

    const save = async () => {
      try {
        setSaveState('Salvando…', 'saving');
        const payload = app.serializeForSave(cadData);
        const snapshot = [...(Array.isArray(payload.history) ? payload.history : [])].reverse()
          .find((item) => item && typeof item === 'object' && item.kind === 'mlightcad-document');
        if (String(snapshot?.dxfBase64 || '').length > 1_500_000) {
          throw new Error('Desenho muito grande para o salvamento integrado desta primeira versão. Exporte o DXF e reduza o arquivo antes de salvar.');
        }
        const response = await fetch(`/desenho-tecnico/cad/${drawingId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.ok === false) throw new Error(result.error || `HTTP ${response.status}`);
        Object.assign(cadData, payload);
        setSaveState('Tudo salvo', 'saved');
        setStatus('Desenho salvo no histórico técnico', 'ok');
      } catch (error) {
        console.error('[CAD][MLightCAD] save error', error);
        setSaveState('Falha ao salvar', 'error');
        setStatus(`Falha ao salvar: ${error.message || error}`, 'error');
      }
    };

    document.getElementById('mlightSaveBtn')?.addEventListener('click', save);
    document.getElementById('mlightDxfExportBtn')?.addEventListener('click', () => app.downloadDxf(cadData.codigo || `CAD-${drawingId}`));
    document.getElementById('mlightZoomExtentsBtn')?.addEventListener('click', () => app.zoomExtents());
    document.getElementById('mlightFlangeBtn')?.addEventListener('click', () => app.createFlange());
    document.getElementById('mlightShaftBtn')?.addEventListener('click', () => app.createShaft());

    const fileInput = document.getElementById('mlightDxfInput');
    document.getElementById('mlightDxfImportBtn')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      if (!/\.dxf$/i.test(file.name)) return setStatus('Selecione um arquivo DXF.', 'error');
      if (!window.confirm('Abrir este DXF substituirá a área de trabalho atual. Salve antes se necessário. Continuar?')) return;
      setStatus(`Abrindo ${file.name}…`, 'loading');
      try {
        const ok = await app.openDxfFile(file);
        setStatus(ok ? `${file.name} aberto. Clique em Salvar desenho para vincular.` : 'Falha ao abrir DXF.', ok ? 'ok' : 'error');
      } catch (error) {
        setStatus(`Falha ao abrir DXF: ${error.message || error}`, 'error');
      }
    });

    document.querySelectorAll('[data-cad-command]').forEach((button) => button.addEventListener('click', () => app.runCommand(button.dataset.cadCommand)));
    const commandForm = document.getElementById('mlightCommandForm');
    const commandInput = document.getElementById('mlightCommandInput');
    commandForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = commandInput?.value?.trim();
      if (!value) return;
      app.runCommand(value);
      commandInput.value = '';
      commandInput.focus();
    });

    window.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save();
      }
      if (event.key === 'F2' && commandInput) {
        event.preventDefault();
        commandInput.focus();
      }
    });

    window.dispatchEvent(new CustomEvent('cad:mlight-ready', { detail: { version: MLIGHTCAD_VERSION } }));
  } catch (error) {
    console.error('[CAD][MLightCAD] bootstrap error', error);
    page.querySelector('#mlightFallbackCard')?.removeAttribute('hidden');
    setStatus(`MLightCAD indisponível: ${error.message || error}`, 'error');
    await new Promise((resolve) => setTimeout(resolve, 350));
    removeShell();
    throw error;
  }
}

await boot();
