import * as THREE from '../vendor/three-0.172.0/three.module.min.js';
import { OrbitControls } from '../vendor/three-0.172.0/OrbitControls.js';

// Modelo 3D navegável em malha de revolução. Não é arquivo STEP/BREP.
// A primeira entrega não subtrai furações transversais: avisar claramente.
export function shaftProfile(model) {
  if (!Array.isArray(model.segments) || model.segments.length < 1 || model.segments.length > 20)
    throw new Error('Quantidade inválida de trechos do eixo.');
  const number = v => Number(v);
  const inner = model.bore ? number(model.bore.diameter) / 2 : 0;
  const pts = [new THREE.Vector2(inner, 0)];
  let length = 0;
  model.segments.forEach((s,i)=>{
    const d=number(s.diameter),l=number(s.length);
    if(!Number.isFinite(d)||!Number.isFinite(l)||d<=0||l<=0)
      throw new Error('Medida de eixo inválida.');
    const r=d/2, bevel=Math.min(1.5,l*.045,d*.025);
    if(i===0){
      pts.push(new THREE.Vector2(r-bevel,0));
      pts.push(new THREE.Vector2(r,bevel));
    } else pts.push(new THREE.Vector2(r,length));
    length+=l;
    if(i===model.segments.length-1){
      pts.push(new THREE.Vector2(r,length-bevel));
      pts.push(new THREE.Vector2(r-bevel,length));
    } else pts.push(new THREE.Vector2(r,length));
  });
  pts.push(new THREE.Vector2(0,length));
  if(model.bore) {
    const depth=number(model.bore.depth);
    if(!Number.isFinite(inner)||inner<=0||inner>=number(model.segments[0].diameter)/2||
       !Number.isFinite(depth)||depth<=0||depth>length)
      throw new Error('Alojamento interno inválido.');
    pts.push(new THREE.Vector2(0,depth));
    pts.push(new THREE.Vector2(inner,depth));
    pts.push(new THREE.Vector2(inner,0));
  }
  return pts;
}

let previousClose = null;
function ensureStyle(){
  if(document.getElementById('cg-shaft-3d-style'))return;
  const style=document.createElement('style');
  style.id='cg-shaft-3d-style';
  style.textContent=`
    .cg3d-overlay{position:fixed;inset:0;z-index:11000;background:#020617df;
      display:flex;justify-content:center;align-items:center;padding:15px}
    .cg3d-modal{width:min(1020px,97vw);height:min(770px,94vh);
      background:#111e2e;color:#eef4fa;border:1px solid #52667c;border-radius:13px;
      box-shadow:0 24px 90px #000a;display:flex;flex-direction:column;overflow:hidden}
    .cg3d-header{display:flex;align-items:center;justify-content:space-between;
      gap:10px;padding:13px 19px;border-bottom:1px solid #334155}
    .cg3d-header small{display:block;color:#a4b4c6;margin-top:2px}
    .cg3d-close{border:1px solid #53677e;border-radius:7px;padding:8px 15px;
      background:#25394d;color:white;cursor:pointer}
    .cg3d-stage{position:relative;flex:1;min-height:180px}
    .cg3d-stage canvas{display:block;width:100%;height:100%;touch-action:none}
    .cg3d-instructions{position:absolute;bottom:12px;left:12px;font-size:12px;
      color:#ecf3fa;background:#0d1725df;padding:7px 11px;border-radius:7px}
    .cg3d-notes{border-top:1px solid #34465b;padding:11px 16px;
      color:#c8d5e1;font-size:12px;line-height:1.6;max-height:140px;overflow:auto}
    .cg3d-warning{color:#fdba74}.cg3d-error{color:#fecaca}
  `;
  document.head.append(style);
}

export async function openShaft3D({cadData,drawingId,label='Eixo escalonado'}={}) {
  if(!drawingId)throw new Error('Identificador do desenho ausente.');
  previousClose?.();
  ensureStyle();
  const overlay=document.createElement('div');
  overlay.className='cg3d-overlay';
  overlay.innerHTML=`
    <div class="cg3d-modal" role="dialog" aria-modal="true" aria-label="Modelo 3D do eixo">
      <div class="cg3d-header"><div><strong>Visualizar eixo em 3D</strong>
        <small class="cg3d-title"></small></div>
        <button type="button" class="cg3d-close">Fechar ×</button></div>
      <div class="cg3d-stage"><div class="cg3d-instructions">
        Arraste para girar · Roda para zoom · Botão direito para deslocar</div></div>
      <div class="cg3d-notes" aria-live="polite">Preparando modelo...</div>
    </div>`;
  overlay.querySelector('.cg3d-title').textContent=String(label);
  const stage=overlay.querySelector('.cg3d-stage');
  const notes=overlay.querySelector('.cg3d-notes');
  const close=overlay.querySelector('.cg3d-close');
  document.body.append(overlay);
  let stopped=false,frame=0,renderer,controls,geometry,material,observer;
  const onKey=e=>{if(e.key==='Escape')cleanup();};
  const cleanup=()=>{
    if(stopped)return;
    stopped=true;
    cancelAnimationFrame(frame);
    document.removeEventListener('keydown',onKey);
    observer?.disconnect();
    controls?.dispose();
    geometry?.dispose();
    material?.dispose();
    renderer?.dispose();
    overlay.remove();
    if(previousClose===cleanup)previousClose=null;
  };
  previousClose=cleanup;
  close.addEventListener('click',cleanup);
  overlay.addEventListener('click',e=>{if(e.target===overlay)cleanup();});
  document.addEventListener('keydown',onKey);
  close.focus();
  try{
    const response=await fetch(`/desenho-tecnico/cad/${encodeURIComponent(drawingId)}/render-3d`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({cadData:cadData||{}})
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok||!body.ok)throw new Error(body.error||'Falha ao gerar modelo 3D.');
    if(stopped)return;
    const model=body.preview3d;
    if(model?.mode!=='parametric-shaft')
      throw new Error('Esta etapa do visualizador suporta eixos criados por medidas.');
    geometry=new THREE.LatheGeometry(shaftProfile(model),96);
    material=new THREE.MeshStandardMaterial({color:0xb9c7d6,metalness:.75,
      roughness:.28,side:THREE.DoubleSide});
    const scene=new THREE.Scene();
    scene.background=new THREE.Color(0x162334);
    const mesh=new THREE.Mesh(geometry,material);
    mesh.rotation.z=-Math.PI/2;
    mesh.position.x=-model.length/2;
    scene.add(mesh);
    scene.add(new THREE.HemisphereLight(0xf4fbff,0x405367,2.4));
    const key=new THREE.DirectionalLight(0xffffff,3);
    key.position.set(80,130,180);scene.add(key);
    const rim=new THREE.DirectionalLight(0x88bbee,1.7);
    rim.position.set(-130,60,-110);scene.add(rim);
    const size=Math.max(model.length,model.maxDiameter*1.8);
    const camera=new THREE.PerspectiveCamera(38,1,.1,size*50);
    camera.position.set(size*.75,size*.65,size*1.5);
    camera.lookAt(0,0,0);
    renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    stage.append(renderer.domElement);
    renderer.domElement.setAttribute('aria-label','Eixo 3D. Arraste para girar e role para zoom.');
    controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true;
    controls.dampingFactor=.11;
    controls.update();
    const resize=()=>{
      if(stopped||!renderer)return;
      const w=Math.max(stage.clientWidth,200),h=Math.max(stage.clientHeight,150);
      camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);
    };
    observer=new ResizeObserver(resize);observer.observe(stage);resize();
    notes.textContent='';
    const summary=document.createElement('div');
    summary.textContent=`Comprimento ${model.length} mm · ${model.segments.length} trechos · `+
      model.segments.map(v=>`Ø${v.diameter} × ${v.length} mm`).join(' · ');
    notes.append(summary);
    if(model.bore) {
      const el=document.createElement('div');
      el.textContent=`Alojamento frontal Ø${model.bore.diameter} × ${model.bore.depth} mm`;
      notes.append(el);
    }
    (model.warnings||[]).forEach(w=>{
      const el=document.createElement('div');
      el.className='cg3d-warning';el.textContent='Atenção: '+w;notes.append(el);
    });
    const foot=document.createElement('div');
    foot.textContent='Prévia geométrica navegável em malha; não equivale a STEP nem substitui desenho de fabricação.';
    notes.append(foot);
    const animate=()=>{
      if(stopped)return;
      controls.update();renderer.render(scene,camera);
      frame=requestAnimationFrame(animate);
    };animate();
  }catch(e){
    if(!stopped){notes.textContent=e.message||String(e);notes.classList.add('cg3d-error');}
  }
}
