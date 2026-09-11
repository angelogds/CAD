const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
let modulePromise = null;
let installing = false;
let installed = false;

function imageModule() {
  if (!modulePromise) modulePromise = import('/vendor/mlightcad/mlightcad-image.js');
  return modulePromise;
}

function setStatus(message, state = 'ok') {
  const el = document.getElementById('mlightCadStatus');
  if (!el) return;
  el.textContent = message;
  el.dataset.state = state;
}

function setSaveState(message, state = 'saving') {
  const el = document.getElementById('mlightSaveState');
  if (!el) return;
  el.textContent = message;
  el.dataset.state = state;
}

async function readImageSize(file) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return size;
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const size = { width: image.naturalWidth, height: image.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(size);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler as dimensões da imagem.'));
    };
    image.src = url;
  });
}

async function uploadImage(drawingId, file) {
  const body = new FormData();
  body.append('image', file, file.name);
  const response = await fetch(`/desenho-tecnico/cad/${drawingId}/images`, {
    method: 'POST',
    body,
    credentials: 'same-origin',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new Error(result.error || `Falha no upload (HTTP ${response.status}).`);
  return result.image;
}

function normalizeWidth(value) {
  const width = Number(value);
  return Number.isFinite(width) && width > 0 && width <= 100000 ? width : null;
}

async function saveBeforePdf({ app, cadData, drawingId, href }) {
  setSaveState('Salvando desenho antes do PDF…', 'saving');
  const payload = app.serializeForSave(cadData);
  if (cadData.manufacturing) payload.manufacturing = cadData.manufacturing;
  const snapshot = [...(Array.isArray(payload.history) ? payload.history : [])].reverse()
    .find((item) => item && typeof item === 'object' && item.kind === 'mlightcad-document');
  if (String(snapshot?.dxfBase64 || '').length > 1_500_000) {
    throw new Error('Desenho muito grande para salvar antes do PDF. Exporte o DXF e reduza o arquivo.');
  }
  const response = await fetch(`/desenho-tecnico/cad/${drawingId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'same-origin',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new Error(result.error || `Falha ao salvar (HTTP ${response.status}).`);
  Object.assign(cadData, payload);
  setSaveState('Tudo salvo', 'saved');
  window.location.assign(href);
}

function bindPdfSafeExport({ app, cadData, drawingId }) {
  const pdfLink = [...document.querySelectorAll('a[href]')].find((node) => new RegExp(`/desenho-tecnico/cad/${drawingId}/pdf(?:$|\\?)`).test(node.getAttribute('href') || ''));
  if (!pdfLink || pdfLink.dataset.cadImagePdfBound === '1') return;
  pdfLink.dataset.cadImagePdfBound = '1';
  pdfLink.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      await saveBeforePdf({ app, cadData, drawingId, href: pdfLink.href });
    } catch (error) {
      console.error('[CAD][IMAGE] Falha ao salvar antes do PDF', error);
      setSaveState('Falha ao salvar', 'error');
      setStatus(`PDF não gerado: ${error.message || error}`, 'error');
    }
  }, true);
}

function injectImageControls({ onChoose }) {
  const page = document.getElementById('cadMlightPage');
  const appbar = page?.querySelector('.cad-mlight-appbar');
  if (!page || !appbar) return null;
  let button = document.getElementById('mlightImageBtn');
  let input = document.getElementById('mlightImageInput');
  if (!button) {
    button = document.createElement('button');
    button.id = 'mlightImageBtn';
    button.type = 'button';
    button.className = 'cad-mlight-action accent';
    button.title = 'Inserir foto ou imagem de referência no desenho (IMAGEM)';
    button.innerHTML = '▧ <span>Imagem</span>';
    const target = document.getElementById('mlightAutoDimBtn') || document.getElementById('mlightDxfImportBtn') || null;
    appbar.insertBefore(button, target);
  }
  if (!input) {
    input = document.createElement('input');
    input.id = 'mlightImageInput';
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,.jpg,.jpeg,.png';
    input.hidden = true;
    page.appendChild(input);
  }
  button.addEventListener('click', () => input.click());
  input.addEventListener('change', onChoose);
  return { button, input };
}

function bindImageCommand(input) {
  const form = document.getElementById('mlightCommandForm');
  const commandInput = document.getElementById('mlightCommandInput');
  if (!form || form.dataset.cadImageCommandBound === '1') return;
  form.dataset.cadImageCommandBound = '1';
  form.addEventListener('submit', (event) => {
    const normalized = String(commandInput?.value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
    if (!['imagem', 'image', 'foto', 'img'].includes(normalized)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (commandInput) commandInput.value = '';
    input?.click();
  }, true);
}

async function install() {
  if (installed || installing || !window.CAD_MLIGHT_READY || !window.CAD_MLIGHT_APP) return;
  installing = true;
  try {
    const api = await imageModule();
    const initial = window.CAD_INITIAL || {};
    const drawingId = Number(initial.desenhoId || 0);
    const cadData = initial.data || {};
    const app = window.CAD_MLIGHT_APP;
    if (!drawingId) throw new Error('Desenho não identificado para inserir imagem.');

    api.patchMlightImageSerialization(app, { drawingId, cadData });
    const restore = await api.restoreManagedRasterImages({ drawingId, cadData });
    if (restore.failed) console.warn('[CAD][IMAGE] Imagens não recuperadas:', restore.failed);

    const controls = injectImageControls({
      onChoose: async (event) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        if (!['image/jpeg', 'image/png'].includes(file.type) && !/\.(jpe?g|png)$/i.test(file.name)) {
          setStatus('Use uma imagem JPG ou PNG.', 'error');
          return;
        }
        if (file.size > IMAGE_MAX_BYTES) {
          setStatus('A imagem excede o limite de 10 MB.', 'error');
          return;
        }

        try {
          const size = await readImageSize(file);
          if (!(size.width > 0 && size.height > 0)) throw new Error('Dimensões da imagem não identificadas.');
          const point = await api.pickImageInsertionPoint('Imagem: clique no ponto de inserção');
          if (!point) {
            setStatus('Inserção da imagem cancelada.', 'ok');
            return;
          }
          const requested = window.prompt('Largura inicial da imagem no desenho (mm):', '250');
          if (requested == null) return;
          const width = normalizeWidth(requested);
          if (!width) throw new Error('Informe uma largura válida em milímetros.');
          const height = width * (size.height / size.width);

          setStatus(`Enviando ${file.name}…`, 'loading');
          const stored = await uploadImage(drawingId, file);
          api.appendManagedRasterImage({
            drawingId,
            blob: file,
            source: stored.url,
            assetId: stored.assetId,
            point,
            width,
            height,
            pixelWidth: size.width,
            pixelHeight: size.height,
            originalName: stored.originalName || file.name,
            mimeType: stored.mimeType || file.type,
          });
          setSaveState('Alterações não salvas', 'saving');
          setStatus('Imagem inserida. Use Selecionar/Mover/Rotacionar e os grips para ajustar.', 'ok');
        } catch (error) {
          console.error('[CAD][IMAGE] Falha ao inserir imagem', error);
          setStatus(`Falha ao inserir imagem: ${error.message || error}`, 'error');
        }
      },
    });
    bindImageCommand(controls?.input);
    bindPdfSafeExport({ app, cadData, drawingId });
    installed = true;
  } catch (error) {
    console.error('[CAD][IMAGE] Falha ao instalar suporte de imagens', error);
    setStatus(`Imagens indisponíveis: ${error.message || error}`, 'error');
  } finally {
    installing = false;
  }
}

window.addEventListener('cad:mlight-ready', install);
if (window.CAD_MLIGHT_READY) install();
