import * as THREE from '../vendor/three-0.172.0/three.module.min.js';

// Corte didático sem escala. Não representa medição, comandos ou movimento físico.
export function createPrensasScene({ makeLabel } = {}) {
  const root = new THREE.Group(), equipment = new Map(), rotors = [], signals = [];
  const mat = (color, opts={}) => new THREE.MeshStandardMaterial({color,metalness:.22,roughness:.5,...opts});
  const steel = mat(0xc9cdd3), edge = mat(0x626c7b), pale = mat(0xe2e5e9),
    red = mat(0xb91e35), dark = mat(0x343b45), cake = mat(0xa77d56),
    oil = mat(0xc48b39), glass = mat(0xb9c1ca,{transparent:true,opacity:.33,depthWrite:false,side:THREE.DoubleSide});
  const mark = (name, position, width=2.6, key=name) => {
    if (!makeLabel) return;
    const item = makeLabel(name, width); item.position.set(...position); item.userData.selectKey=key; root.add(item);
  };
  const mesh = (parent, geometry, material, at=[0,0,0]) => {
    const m=new THREE.Mesh(geometry,material); m.position.set(...at); parent.add(m); return m;
  };
  const box=(parent,size,at,material=steel)=>mesh(parent,new THREE.BoxGeometry(...size),material,at);
  const cyl=(parent,r,h,at,material=steel,axis='y')=>{
    const m=mesh(parent,new THREE.CylinderGeometry(r,r,h,24),material,at);
    if(axis==='x')m.rotation.z=Math.PI/2;
    if(axis==='z')m.rotation.x=Math.PI/2;
    return m;
  };
  const group=(key,at=[0,0,0])=>{
    const g=new THREE.Group();g.position.set(...at);g.userData.selectKey=key;
    root.add(g);equipment.set(key,g);return g;
  };
  const line=(parent,points,radius,material)=>{
    const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');
    return mesh(parent,new THREE.TubeGeometry(path,Math.max(28,points.length*10),radius,8,false),material);
  };
  function helix(parent,length,radius,turns,material=dark) {
    const points=[];
    for(let i=0;i<=160;i++){const t=i/160,a=t*2*Math.PI*turns;points.push(new THREE.Vector3((t-.5)*length,Math.sin(a)*radius,Math.cos(a)*radius));}
    return mesh(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),190,.053,6,false),material);
  }
  function conveyor(key,at,len,rotation=0) {
    const g=group(key,at);g.rotation.z=rotation;
    const shell=cyl(g,.38,len,[0,0,0],glass,'x');
    shell.material.side=THREE.DoubleSide;
    cyl(g,.07,len+.3,[0,0,0],edge,'x');
    const moving=new THREE.Group();g.add(moving);helix(moving,len,.27,Math.round(len*1.4),steel);
    rotors.push({mesh:moving,axis:'x',active:s=>key==='RETURN'?s.returnScrew:s.cakeScrew});
    cyl(g,.22,.56,[-len/2-.22,0,0],red,'x');
    return g;
  }
  box(root,[26,.14,13],[0,-.25,0],mat(0xe8e9ec,{metalness:0}));
  const grid=new THREE.GridHelper(25,25,0xcbd0d6,0xdce0e4);grid.position.y=-.17;root.add(grid);

  // Fluxo percoladora -> tolva. A boca recebe material lateralmente.
  const perco=group('PERCOLADORA',[-11,5.65,-1.5]);
  box(perco,[3.0,1.2,1.25],[0,0,0],glass);
  const percoAuger=new THREE.Group();perco.add(percoAuger);
  helix(percoAuger,2.8,.34,4.5,edge);
  line(root,[[-9.5,5.4,-1.5],[-7.7,5.4,-1.5]],.25,cake);
  mark('SAÍDA DA PERCOLADORA',[-10.7,6.75,-1.2],3.6,'PERCOLADORA');

  const tolva=group('TOLVA',[0,5.85,-1.3]);
  // Carcaça retangular com face frontal aberta e duas roscas visíveis.
  box(tolva,[15,.14,2.4],[0,-.88,0],edge);
  box(tolva,[15,.13,2.4],[0,.95,0],glass);
  box(tolva,[15,1.8,.12],[0,0,-1.19],steel);
  box(tolva,[15,1.8,.10],[0,0,1.19],glass);
  box(tolva,[.14,1.85,2.4],[-7.5,0,0],steel);
  box(tolva,[.14,1.85,2.4],[7.5,0,0],steel);
  for(let n=0;n<2;n++){
    const screw=new THREE.Group(); screw.position.set(0,0,n? .63:-.63);tolva.add(screw);
    cyl(screw,.07,14.2,[0,0,0],dark,'x');helix(screw,14.2,.39,16,steel);
    rotors.push({mesh:screw,axis:'x',speed:n?-1.4:1.4,active:s=>s.mixers});
  }
  mark('TOLVA DAS PRENSAS · 2 ROSCAS CONTRARROTATIVAS',[0,7.1,-1.3],7,'TOLVA');

  const presses=[{id:'FAST',x:-5.2},{id:'P50',x:0},{id:'P46',x:5.2}];
  presses.forEach(({id,x})=>{
    const g=group(id,[x,2.18,1.7]);
    // Entrada no topo e descarga de torta na extremidade inferior da máquina.
    cyl(g,.72,2.5,[0,0,0],glass,'z');
    for(const z of [-1.20,1.20])cyl(g,.73,.12,[0,0,z],edge,'z');
    const shaft=new THREE.Group();g.add(shaft);
    cyl(shaft,.12,3.1,[0,0,0],dark,'z');
    const winding=helix(shaft,2.65,.51,7.2,steel);winding.rotation.y=Math.PI/2;
    // Hélice usa geometria em x, girada para ficar paralela à prensa (z).
    rotors.push({mesh:shaft,axis:'z',active:s=>s.feed[id]});
    for(const xFoot of [-.50,.50]) for(const zFoot of [-.8,.8])
      box(g,[.14,1.22,.14],[xFoot,-1.16,zFoot],edge);
    box(g,[1.95,.17,3.0],[0,-.74,0],edge);
    box(g,[1.2,.55,.8],[0,0,-1.7],red);
    box(g,[.85,.15,.74],[0,1.13,-.45],steel);
    // Saída inferior de óleo/sumidouro distinta da torta.
    box(g,[1.2,.18,1.1],[0,-1.0,.35],oil);
    line(root,[[x,4.98,-1.3],[x,3.9,-1.3],[x,3.9,.85],[x,3.18,.85]],.18,pale);
    const gate=group('GATE_'+id,[x,4.58,-1.3]);
    box(gate,[1.1,.3,.9],[0,0,0],edge);
    const blade=box(gate,[1.06,.09,.93],[0,0,0],red);
    box(gate,[.22,.5,.25],[0,.43,0],dark);
    signals.push({type:'gate',id,mesh:blade});
    // Rosca entre guilhotina e alimentação superior.
    const feeder=new THREE.Group();feeder.position.set(x,3.82,.28);feeder.rotation.x=-.31;root.add(feeder);
    cyl(feeder,.20,2.3,[0,0,0],glass,'z');
    const thread=new THREE.Group();feeder.add(thread);
    helix(thread,2.2,.16,6,pale).rotation.y=Math.PI/2;
    rotors.push({mesh:thread,axis:'z',active:s=>s.feed[id]});
    mark('GUILHOTINA + ROSCA '+id,[x,5.05,1.75],3.2,'GATE_'+id);
    mark('PRENSA '+id,[x,3.27,2.75],2.6,id);
    // Tacho individual de óleo e bomba de uma única prensa.
    const pump=group('PUMP_'+id,[x,.67,-1.5]);
    cyl(pump,.32,.7,[.25,0,0],red,'x');
    cyl(pump,.28,.33,[-.38,0,0],steel,'x');
    box(pump,[1.5,.1,.9],[0,-.40,0],edge);
    const impeller=new THREE.Group();pump.add(impeller);
    cyl(impeller,.15,.9,[0,0,0],dark,'x');
    rotors.push({mesh:impeller,axis:'x',speed:3,active:s=>s.oilPumps[id]});
    line(root,[[x,1.1,1.6],[x,.95,.2],[x,.95,-1.45]],.105,oil);
    mark('BOMBA ÓLEO '+id,[x,.35,-2.35],2.6,'PUMP_'+id);
  });

  const cakeGroup=conveyor('CAKE',[0,.42,4.5],14.0);
  mark('ROSCA DE SAÍDA · TORTA SECA',[-2.4,1.22,4.8],4.2,'CAKE');
  // Cada prensa descarrega material sólido na rosca comum.
  presses.forEach(({x})=>line(root,[[x,1.15,3.0],[x,.65,3.0],[x,.65,4.5]],.17,cake));
  // Retorno inclinado do fim P46, dentro de tubo fechado com hélice visível.
  const start=new THREE.Vector3(7.25,.8,4.5),end=new THREE.Vector3(7.25,6.0,-1.3);
  const v=end.clone().sub(start),center=start.clone().add(end).multiplyScalar(.5);
  const returnGroup=conveyor('RETURN',[center.x,center.y,center.z],v.length());
  returnGroup.rotation.set(0,0,0);
  returnGroup.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),v.clone().normalize());
  mark('ROSCA INCLINADA · RETORNO À TOLVA',[9.3,4.35,2.1],4.8,'RETURN');

  // Linhas do óleo separadas por prensa, convergindo para o tacho da percoladora.
  presses.forEach(({id,x})=>line(root,[[x-.8,.67,-1.5],[x-.8,.67,-3.5],[-9.4,.67,-3.5]],.09,oil));
  const tacho=group('OIL',[-10.2,.55,-3.5]);
  cyl(tacho,.86,1.0,[0,.38,0],glass);
  cyl(tacho,.86,.12,[0,-.1,0],edge);
  mark('TACHO DA PERCOLADORA · ÓLEO',[-10.4,2.0,-3.5],4.7,'OIL');

  function update(s, phase, options={}) {
    const animated=options.motion && s.mode==='SIMULACAO' && s.running;
    for(const rotor of rotors){
      const on=animated && rotor.active(s);
      if(on)rotor.mesh.rotation[rotor.axis]+=0.035*(rotor.speed||1);
    }
    for(const entry of signals) {
      const on=s.mode==='SIMULACAO' && s.guillotines[entry.id];
      entry.mesh.material=on?red:dark;
      entry.mesh.position.y=on?-.15:0;
    }
  }
  function dispose() {
    const materials=new Set(),geometries=new Set();
    root.traverse(obj=>{if(obj.isMesh){geometries.add(obj.geometry);if(Array.isArray(obj.material))obj.material.forEach(m=>materials.add(m));else materials.add(obj.material);}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  }
  return {root,equipment,update,dispose};
}
