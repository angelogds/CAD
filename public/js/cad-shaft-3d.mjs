import * as THREE from '../vendor/three-0.172.0/three.module.min.js';
import { OrbitControls } from '../vendor/three-0.172.0/OrbitControls.js';
import { buildModel3D, shaftProfilePoints } from './cad-model-3d.logic.mjs';

// Prévia em malha, sem exportação STEP/BREP. Não subtrai furações transversais:
// essas entidades ficam indisponíveis, com o motivo, em vez de exibir um sólido incompleto.
export function shaftProfile(model) {
  return (model.profile || shaftProfilePoints(model)).map(point => new THREE.Vector2(point.radius, point.distance));
}

export function createModelGeometry(item) {
  if (item.kind === 'shaft') return new THREE.LatheGeometry(shaftProfile(item), 96);
  const shape = new THREE.Shape();
  if (item.profile.type === 'circle') shape.absarc(0, 0, item.profile.radius, 0, Math.PI * 2, false);
  else {
    item.profile.points.forEach((point, index) => {
      if (index === 0) shape.moveTo(point.x, point.y);
      else shape.lineTo(point.x, point.y);
    });
    shape.closePath();
  }
  for (const hole of item.holes || []) {
    const path = new THREE.Path();
    path.absarc(hole.x, hole.y, hole.radius, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }
  return new THREE.ExtrudeGeometry(shape, {
    depth: item.thickness, bevelEnabled: false, steps: 1, curveSegments: 64,
  });
}

const DIRECTIONS = Object.freeze({
  iso: [1, -1, 1], front: [0, -1, 0], top: [0, 0, 1], right: [1, 0, 0],
});

// Fit actual projected bounds, including narrow stages and long shafts.
export function frameModelBounds(bounds, aspect = 1, direction = DIRECTIONS.iso, up = [0, 0, 1]) {
  const box = new THREE.Box3(
    new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
    new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
  );
  const target = box.getCenter(new THREE.Vector3());
  const normal = new THREE.Vector3(...direction).normalize();
  const cameraUp = new THREE.Vector3(...up).normalize();
  if (Math.abs(normal.dot(cameraUp)) > .999) cameraUp.set(0, 1, 0);
  let vertical = cameraUp.clone();
  const horizontal = vertical.clone().cross(normal).normalize();
  vertical = normal.clone().cross(horizontal).normalize();
  let halfWidth = 0, halfHeight = 0, halfDepth = 0;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const offset = new THREE.Vector3(x, y, z).sub(target);
    halfWidth = Math.max(halfWidth, Math.abs(offset.dot(horizontal)));
    halfHeight = Math.max(halfHeight, Math.abs(offset.dot(vertical)));
    halfDepth = Math.max(halfDepth, Math.abs(offset.dot(normal)));
  }
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const height = Math.max(halfHeight * 2, halfWidth * 2 / safeAspect, .001) * 1.18;
  const span = Math.max(box.getSize(new THREE.Vector3()).length(), .001);
  const distance = Math.max(height / (2 * Math.tan(THREE.MathUtils.degToRad(19))) + halfDepth, span * 1.5);
  return { target, direction: normal, up: cameraUp, height, distance, span };
}

let previousClose = null;
function ensureStyle() {
  if (document.getElementById('cg-shaft-3d-style')) return;
  const style = document.createElement('style');
  style.id = 'cg-shaft-3d-style';
  style.textContent = `
    .cg3d-overlay{position:fixed;inset:0;z-index:11000;background:#020617df;display:flex;justify-content:center;align-items:center;padding:15px}
    .cg3d-modal{width:min(1120px,97vw);height:min(820px,94vh);background:#111e2e;color:#eef4fa;border:1px solid #52667c;border-radius:13px;box-shadow:0 24px 90px #000a;display:flex;flex-direction:column;overflow:hidden;font:14px/1.45 system-ui,sans-serif}
    .cg3d-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 19px;border-bottom:1px solid #334155}
    .cg3d-header small{display:block;color:#b5c5d6;margin-top:2px}
    .cg3d-modal button,.cg3d-modal select{border:1px solid #53677e;border-radius:6px;padding:7px 11px;background:#25394d;color:#eef4fa;font:inherit;cursor:pointer}
    .cg3d-modal button:hover{background:#37536c}.cg3d-modal button:active{background:#466782}
    .cg3d-modal button:focus-visible,.cg3d-modal select:focus-visible{outline:2px solid #8cd6f5;outline-offset:2px}
    .cg3d-modal button[aria-pressed=true]{background:#14567a;border-color:#7dd3fc}
    .cg3d-modal button:disabled,.cg3d-modal select:disabled{opacity:.5;cursor:default}
    .cg3d-toolbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:9px 14px;border-bottom:1px solid #334155;background:#17283b}
    .cg3d-toolbar label{display:flex;align-items:center;gap:7px;margin-left:auto}
    .cg3d-stage{position:relative;flex:1;min-height:150px;overflow:hidden}
    .cg3d-stage canvas{display:block;width:100%;height:100%;touch-action:none}
    .cg3d-instructions{position:absolute;bottom:10px;left:10px;right:10px;font-size:12px;color:#ecf3fa;background:#0d1725df;padding:6px 10px;border-radius:6px;pointer-events:none}
    .cg3d-view-name{position:absolute;top:11px;left:13px;color:#d5e9fa;pointer-events:none}
    .cg3d-empty{display:grid;place-items:center;height:100%;padding:30px;text-align:center;color:#d9e5f2}
    .cg3d-notes{border-top:1px solid #34465b;padding:10px 16px;color:#c8d5e1;font-size:12px;line-height:1.6;max-height:155px;overflow:auto}
    .cg3d-warning{color:#fdba74}.cg3d-error{color:#fecaca}
    @media(max-width:600px){.cg3d-overlay{padding:4px}.cg3d-modal{height:97dvh;width:99vw}.cg3d-header{padding:9px 12px}.cg3d-toolbar{gap:5px;padding:7px}.cg3d-modal button,.cg3d-modal select{padding:6px 8px;font-size:12px}.cg3d-toolbar label{margin-left:0}.cg3d-notes{max-height:120px}}
    @media(prefers-contrast:more){.cg3d-modal button,.cg3d-modal select{border-color:#fff}}
  `;
  document.head.append(style);
}

export async function openDrawing3D({ cadData = {}, label = 'Desenho técnico' } = {}) {
  previousClose?.();
  ensureStyle();
  const priorFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'cg3d-overlay';
  overlay.innerHTML = `
    <div class="cg3d-modal" role="dialog" aria-modal="true" aria-label="Visualização 3D do desenho">
      <div class="cg3d-header"><div><strong>Visualizar desenho em 3D</strong><small class="cg3d-title"></small></div>
        <button type="button" class="cg3d-close">Fechar ×</button></div>
      <div class="cg3d-toolbar" role="toolbar" aria-label="Vistas do modelo 3D">
        <button type="button" data-view="iso" aria-pressed="true">Isométrica</button>
        <button type="button" data-view="front" aria-pressed="false">Frontal</button>
        <button type="button" data-view="top" aria-pressed="false">Superior</button>
        <button type="button" data-view="right" aria-pressed="false">Direita</button>
        <button type="button" data-fit>Ajustar à tela</button>
        <button type="button" data-edges aria-pressed="true">Arestas</button>
        <label>Projeção <select class="cg3d-projection" aria-label="Projeção do modelo"><option value="orthographic">Ortográfica</option><option value="perspective">Perspectiva</option></select></label>
      </div>
      <div class="cg3d-stage"><span class="cg3d-view-name" aria-live="polite">Isométrica · mm</span>
        <div class="cg3d-instructions">Arraste para girar · Roda para zoom · Botão direito para deslocar · Esc para fechar</div></div>
      <div class="cg3d-notes" aria-live="polite">Preparando modelo…</div>
    </div>`;
  overlay.querySelector('.cg3d-title').textContent = String(label);
  const stage = overlay.querySelector('.cg3d-stage');
  const notes = overlay.querySelector('.cg3d-notes');
  const close = overlay.querySelector('.cg3d-close');
  const projection = overlay.querySelector('.cg3d-projection');
  const viewName = overlay.querySelector('.cg3d-view-name');
  const viewButtons = [...overlay.querySelectorAll('[data-view]')];
  const resources = new Set(), meshes = [];
  document.body.append(overlay);
  let stopped = false, frame = 0, renderer, controls, observer, camera, scene, bounds;
  let width = 1, height = 1, initialFit = true, fitting = false;
  const onKey = event => {
    // Do not forward shortcuts into the 2D editor while the modal owns focus.
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); cleanup(); }
    if (event.key === 'Tab') {
      const focusable = [...overlay.querySelectorAll('button:not(:disabled),select:not(:disabled),canvas')];
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };
  const onVisibility = () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else requestRender();
  };
  const cleanup = () => {
    if (stopped) return;
    stopped = true; cancelAnimationFrame(frame);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', resize);
    observer?.disconnect(); controls?.dispose();
    for (const resource of resources) resource.dispose();
    renderer?.dispose(); overlay.remove();
    if (previousClose === cleanup) previousClose = null;
    if (priorFocus?.isConnected) priorFocus.focus();
  };
  const requestRender = () => {
    if (stopped || frame || !renderer || document.hidden) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (stopped) return;
      if (controls?.update()) requestRender();
      renderer.render(scene, camera);
    });
  };
  const setControls = () => {
    controls?.dispose();
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    controls.dampingFactor = .16;
    controls.screenSpacePanning = true;
    controls.addEventListener('change', () => {
      if (!fitting) {
        viewButtons.forEach(button => button.setAttribute('aria-pressed', 'false'));
        viewName.textContent = 'Vista livre · mm';
      }
      requestRender();
    });
  };
  const fit = (direction, up) => {
    const currentDirection = direction || camera.position.clone().sub(controls.target).toArray();
    const info = frameModelBounds(bounds, width / height, currentDirection, up || camera.up.toArray());
    fitting = true;
    controls.dispose();
    camera.up.copy(info.up);
    camera.position.copy(info.target).addScaledVector(info.direction, info.distance);
    camera.near = Math.max(info.span / 10000, .000001);
    camera.far = info.distance + info.span * 100; camera.zoom = 1;
    if (camera.isOrthographicCamera) {
      camera.top = info.height / 2; camera.bottom = -camera.top;
      camera.right = camera.top * width / height; camera.left = -camera.right;
    } else camera.aspect = width / height;
    camera.lookAt(info.target); camera.updateProjectionMatrix();
    // OrbitControls caches its up-axis; rebuild after switching top/front views.
    // This also clears residual damping so a preset is aligned immediately.
    setControls(); controls.target.copy(info.target);
    controls.minDistance = Math.max(info.span / 1000, .000001); controls.maxDistance = info.span * 100;
    controls.update(); fitting = false; requestRender();
  };
  const resize = () => {
    if (stopped || !renderer) return;
    const oldWidth = width, oldHeight = height;
    width = Math.max(stage.clientWidth, 1); height = Math.max(stage.clientHeight, 1);
    renderer.setSize(width, height, false);
    if (initialFit) { initialFit = false; fit(DIRECTIONS.iso); }
    // Refit in the current orientation so rotating the device does not crop a long part.
    else if (oldWidth !== width || oldHeight !== height) fit();
  };
  previousClose = cleanup;
  close.addEventListener('click', cleanup);
  overlay.addEventListener('click', event => { if (event.target === overlay) cleanup(); });
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('visibilitychange', onVisibility);
  close.focus();
  try {
    const model = buildModel3D(cadData);
    notes.textContent = '';
    const addNote = (text, warning = false) => {
      const node = document.createElement('div'); node.textContent = text;
      if (warning) node.className = 'cg3d-warning'; notes.append(node);
    };
    addNote(`${model.items.length} componente(s) com volume definido · medidas em mm · estado atual do desenho`);
    for (const warning of model.warnings || []) addNote(warning, true);
    for (const item of model.unsupported || []) addNote(`${item.id || item.kind}: ${item.reason}`, true);
    addNote('Prévia geométrica em malha; confira a prancha técnica e o STEP antes da fabricação.');
    if (!model.items.length) {
      const empty = document.createElement('div'); empty.className = 'cg3d-empty';
      empty.textContent = 'Nenhum volume definido. Cadastre um eixo, ou informe a espessura do flange/perfil fechado nas propriedades.';
      stage.append(empty);
      overlay.querySelectorAll('.cg3d-toolbar button,.cg3d-toolbar select').forEach(node => { node.disabled = true; });
      return { close: cleanup, model };
    }
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x162334);
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0xb9c7d6, metalness: .45, roughness: .38 });
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x1e354b, transparent: true, opacity: .7 });
    resources.add(material); resources.add(edgeMaterial);
    for (const item of model.items) {
      const geometry = createModelGeometry(item); resources.add(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(item.position.x, item.position.y, item.position.z);
      if (item.kind === 'shaft' && item.orientation !== 'vertical') mesh.rotation.z = -Math.PI / 2;
      const edges = new THREE.EdgesGeometry(geometry, 30); resources.add(edges);
      const wire = new THREE.LineSegments(edges, edgeMaterial);
      mesh.add(wire); meshes.push(wire); group.add(mesh);
    }
    scene.add(group);
    const box = new THREE.Box3().setFromObject(group); bounds = { min: box.min, max: box.max };
    scene.add(new THREE.HemisphereLight(0xf4fbff, 0x405367, 2.4));
    const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(1, -2, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(0x88bbee, 1.7); rim.position.set(-2, 1, 1); scene.add(rim);
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .001, 10000); camera.up.set(0, 0, 1);
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('aria-label', 'Modelo 3D. Arraste para girar, use a roda para zoom e os botões para vistas alinhadas.');
    stage.append(renderer.domElement); setControls();
    viewButtons.forEach(button => button.addEventListener('click', () => {
      const key = button.dataset.view;
      fit(DIRECTIONS[key], key === 'top' ? [0, 1, 0] : [0, 0, 1]);
      viewButtons.forEach(node => node.setAttribute('aria-pressed', String(node === button)));
      viewName.textContent = `${button.textContent} · mm`;
    }));
    overlay.querySelector('[data-fit]').addEventListener('click', () => fit());
    overlay.querySelector('[data-edges]').addEventListener('click', event => {
      const visible = event.currentTarget.getAttribute('aria-pressed') !== 'true';
      event.currentTarget.setAttribute('aria-pressed', String(visible));
      meshes.forEach(mesh => { mesh.visible = visible; }); requestRender();
    });
    projection.addEventListener('change', () => {
      const direction = camera.position.clone().sub(controls.target).toArray(); const up = camera.up.toArray();
      camera = projection.value === 'perspective' ? new THREE.PerspectiveCamera(38, width / height, .001, 10000) : new THREE.OrthographicCamera(-1, 1, 1, -1, .001, 10000);
      setControls(); fit(direction, up);
    });
    if (typeof ResizeObserver === 'function') { observer = new ResizeObserver(resize); observer.observe(stage); }
    window.addEventListener('resize', resize); resize();
    return { close: cleanup, model };
  } catch (error) {
    notes.textContent = error.message || String(error); notes.classList.add('cg3d-error');
    return { close: cleanup, error };
  }
}

// Compatibility with the existing actions in both editors.
export const openShaft3D = openDrawing3D;
