import * as THREE from '../vendor/three-0.172.0/three.module.min.js';
import { OrbitControls } from '../vendor/three-0.172.0/OrbitControls.js';
import { createIndustrialScene, selectionKey } from './automacao-decanters-scene.mjs';

const host = document.getElementById('dec-three-host');
if (host) {
  try { initialize(); } catch (error) { fallback('Visualização 3D indisponível neste navegador. Use o esquema interativo.'); }
}

function fallback(message) {
  const status = document.getElementById('dec-view-message');
  if (status) status.textContent = message;
  window.dispatchEvent(new CustomEvent('decanters:3d-unavailable'));
}

function initialize() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf1f2f5);
  const camera = new THREE.OrthographicCamera(-16, 16, 10, -10, 0.1, 150);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  host.appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Cena 3D do circuito das decanters. Arraste para girar; use a lista de equipamentos para selecionar pelo teclado.');
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minZoom = 0.65;
  controls.maxZoom = 3.5;
  controls.maxPolarAngle = Math.PI / 2.08;
  controls.minPolarAngle = 0.15;
  controls.screenSpacePanning = true;
  controls.listenToKeyEvents(canvas);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xa1a5b0, 2.6));
  const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
  keyLight.position.set(-5, 15, 10);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xffffff, 1.5);
  rimLight.position.set(7, 8, -8);
  scene.add(rimLight);

  function makeLabel(text, width) {
    const image = document.createElement('canvas');
    image.width = 640;
    image.height = 100;
    const context = image.getContext('2d');
    if (!context) return new THREE.Group();
    context.fillStyle = 'rgba(255,255,255,0.95)';
    context.fillRect(0, 0, 640, 100);
    context.fillStyle = '#ba1931';
    context.fillRect(0, 0, 8, 100);
    context.fillStyle = '#292c33';
    context.font = '600 29px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 324, 52, 600);
    const texture = new THREE.CanvasTexture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    sprite.scale.set(width, width / 6.4, 1);
    sprite.renderOrder = 5;
    return sprite;
  }
  const model = createIndustrialScene({ makeLabel });
  scene.add(model.root);
  const selection = new THREE.BoxHelper(new THREE.Object3D(), 0xba1931);
  selection.visible = false;
  selection.material.depthTest = false;
  scene.add(selection);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motion = !reduced.matches;
  let visible = true;
  let dirty = true;
  let selected = null;
  let snapshot = window.AutomacaoDecantersDashboard?.getSnapshot();
  let phase = 0;
  let lastFrame = 0;
  let disposed = false;

  function fit() {
    camera.position.set(18, 16, 23);
    controls.target.set(-0.4, 1.5, -0.7);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.update();
    dirty = true;
  }
  function resize() {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    const aspect = width / height;
    const vertical = Math.max(16, 29 / aspect);
    camera.left = -vertical * aspect / 2;
    camera.right = vertical * aspect / 2;
    camera.top = vertical / 2;
    camera.bottom = -vertical / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    dirty = true;
  }
  function select(key) {
    const object = model.equipment.get(key);
    selected = key;
    selection.visible = Boolean(object);
    if (object) selection.setFromObject(object);
    dirty = true;
  }
  let down;
  canvas.addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY }; });
  canvas.addEventListener('pointerup', event => {
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) { down = null; return; }
    down = null;
    const bounds = canvas.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(model.root.children, true).find(item => selectionKey(item.object));
    if (hit) window.AutomacaoDecantersDashboard?.selectEquipment(selectionKey(hit.object));
  });
  canvas.addEventListener('pointercancel', () => { down = null; });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    fallback('A cena 3D foi interrompida. O esquema e os indicadores continuam disponíveis. Recarregue para tentar novamente.');
  });
  controls.addEventListener('change', () => { dirty = true; });
  window.addEventListener('decanters:state', event => { snapshot = event.detail; dirty = true; });
  window.addEventListener('decanters:ready', () => { snapshot = window.AutomacaoDecantersDashboard?.getSnapshot(); dirty = true; });
  window.addEventListener('decanters:select', event => select(event.detail.key));
  window.addEventListener('decanters:fit', () => { fit(); resize(); });
  window.addEventListener('decanters:motion', event => { motion = Boolean(event.detail.enabled) && !reduced.matches; dirty = true; });
  reduced.addEventListener('change', () => { motion = !reduced.matches; dirty = true; });
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const intersection = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); dirty = true; });
  intersection.observe(host);
  fit();
  resize();
  function frame(time) {
    if (disposed) return;
    requestAnimationFrame(frame);
    if (document.hidden || !visible || host.hidden || time - lastFrame < 33) return;
    const delta = lastFrame ? Math.min(0.05, (time - lastFrame) / 1000) : 0;
    lastFrame = time;
    const animating = motion && snapshot?.mode === 'SIMULACAO' && snapshot.running;
    if (animating) phase += delta;
    controls.update();
    if (!dirty && !animating) return;
    if (snapshot) model.update(snapshot, phase, { motion });
    if (selected) selection.update();
    renderer.render(scene, camera);
    dirty = false;
  }
  requestAnimationFrame(frame);
  document.getElementById('dec-3d-loading')?.remove();
  host.dataset.ready = 'true';
  window.dispatchEvent(new CustomEvent('decanters:3d-ready'));
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    disposed = true;
    observer.disconnect();
    intersection.disconnect();
    controls.dispose();
    model.dispose();
    selection.geometry.dispose();
    selection.material.dispose();
    renderer.dispose();
  }, { once: true });
}
