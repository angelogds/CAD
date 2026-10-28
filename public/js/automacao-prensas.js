/* Supervisão sem telemetria. Simulador efêmero, isolado e servido apenas ao ADMIN. */
(function (root) {
  'use strict';
  if (!root || !root.AutomacaoPrensasCore) return;
  const main=document.getElementById('prensas-dashboard');
  if (!main) return;
  const Core=root.AutomacaoPrensasCore;
  const simulationAllowed=main.dataset.prSimulationAllowed==='true';
  const state=Core.createState();
  let view='3d',unavailable3d=false,visualMotion=true;
  const $=id=>document.getElementById(id);
  const send=(event,detail={})=>root.dispatchEvent(new CustomEvent('prensas:'+event,{detail}));
  const setText=(id,value)=>{const e=$(id);if(e)e.textContent=value;};
  const names={
    TOLVA:['Tolva das prensas','Duas roscas internas de sentidos opostos para homogeneizar o material proveniente da percoladora.'], 
    PERCOLADORA:['Saída da percoladora','Material segue da percoladora até a tolva superior das prensas.'],
    FAST:['Prensa FAST','Entrada superior de material; torta seca pela descarga inferior; óleo segue à bomba individual da FAST.'],
    P50:['Prensa P50','Alimentação pela guilhotina e rosca P50. Óleo coletado pela bomba da P50.'],
    P46:['Prensa P46','Alimentação independente. Na extremidade da saída da torta fica a coleta para a rosca tubular de retorno.'],
    GATE_FAST:['Guilhotina pneumática FAST','Saída inferior da tolva e rosca de alimentação da FAST. Sensores de posição não integrados.'],
    GATE_P50:['Guilhotina pneumática P50','Saída inferior da tolva e rosca de alimentação da P50. Sensores de posição não integrados.'],
    GATE_P46:['Guilhotina pneumática P46','Saída inferior da tolva e rosca de alimentação da P46. Sensores de posição não integrados.'],
    PUMP_FAST:['Bomba de óleo FAST','Bomba individual da FAST: óleo segue para o tacho da percoladora. Fluxo real não confirmado.'],
    PUMP_P50:['Bomba de óleo P50','Bomba individual da P50: óleo segue para o tacho da percoladora. Fluxo real não confirmado.'],
    PUMP_P46:['Bomba de óleo P46','Bomba individual da P46: óleo segue para o tacho da percoladora. Fluxo real não confirmado.'],
    CAKE:['Rosca comum da torta seca','Recolhe material das três prensas. Retorno de rotação/corrente ainda não integrado.'],
    RETURN:['Rosca inclinada de retorno','Rosca helicoidal dentro de tubo, recebe material mal prensado próximo da P46 e o devolve à tolva.'],
    OIL:['Tacho da percoladora','Recebe óleo das três bombas individuais. Medição de vazão e volumes ainda não integrada.']
  };
  let selected='TOLVA';
  function selectEquipment(key) {
    if (!names[key])return;
    selected=key;Core.select(state,key);
    setText('pr-selection-name',names[key][0]);setText('pr-selection-detail',names[key][1]);
    main.querySelectorAll('[data-prensa-select]').forEach(e=>{
      const active=e.dataset.prensaSelect===key;
      e.classList.toggle('is-selected',active);e.setAttribute('aria-pressed',String(active));
    });
    send('select',{key});render();
  }
  function render(){
    const s=Core.snapshot(state);
    setText('pr-mode-status',s.mode==='SIMULACAO'?(s.running?'SIMULAÇÃO LOCAL · EM EXECUÇÃO':'SIMULAÇÃO LOCAL · PAUSADA'):'SUPERVISÃO · SEM SINAL');
    setText('pr-flow-status',s.mode==='LIVE'
      ? 'Aguardando instrumentação. Nenhum acionamento, sensor ou vazão está confirmado.'
      : 'Tolva '+(s.mixers?'misturando':'parada')+' · '+Core.MACHINES.filter(id=>s.feed[id]).map(id=>'alimenta '+id).join(', ')+
        ' · retorno '+(s.returnScrew?'ativo':'parado')+' (apenas virtual)');
    setText('pr-timer',s.mode==='SIMULACAO'?'Tempo virtual: '+Math.round(s.seconds)+' s':'Tempo virtual: —');
    for(const id of Core.MACHINES){
      const c=main.querySelector('[data-prensa="prensa-'+id.toLowerCase()+'"]');
      if(c){const badge=c.querySelector('.signal-pill');if(badge){badge.textContent=s.mode==='LIVE'?'Sem sinal':s.feed[id]?'Alimentando · simulado':'Parada · simulado';badge.classList.toggle('offline',s.mode==='LIVE');}}
      const lbl=$('pr-state-'+id);
      if(lbl)lbl.textContent=s.mode==='LIVE'?'SEM SINAL':s.feed[id]?'Alimentação virtual ativa':'Bloqueado / parado';
    }
    for(const item of main.querySelectorAll('input[data-pr-switch]')){
      const id=item.dataset.prKey,kind=item.dataset.prSwitch;
      const value=kind==='gate'?state.gates[id]:kind==='press'?state.presses[id]:
        kind==='return'?state.returnScrew:kind==='mixer'?state.mixers:state.cakeScrew;
      item.checked=Boolean(value);
    }
    send('state',s);
  }
  function setView(next){
    if(next!=='3d'&&next!=='scheme')return;
    if(next==='3d'&&unavailable3d)next='scheme';
    view=next;
    $('pr-three-host').hidden=next!=='3d';
    $('pr-scheme-host').hidden=next!=='scheme';
    main.querySelectorAll('[data-pr-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.prView===next)));
    setText('pr-view-message',next==='3d'?'Arraste para girar · clique no equipamento · use a roda para aproximar':'Esquema técnico sem escala · selecione um equipamento ou exporte o SVG');
    send('fit');
  }
  main.querySelectorAll('[data-pr-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.prView)));
  root.addEventListener('prensas:3d-unavailable',()=>{unavailable3d=true;const b=main.querySelector('[data-pr-view="3d"]');if(b)b.disabled=true;setView('scheme');});
  $('pr-fit')?.addEventListener('click',()=>{if(view==='3d')send('fit');else $('pr-scheme-host').scrollLeft=0;});
  $('pr-motion')?.addEventListener('click',()=>{
    visualMotion=!visualMotion;
    $('pr-motion').setAttribute('aria-pressed',String(!visualMotion));
    $('pr-motion').textContent=visualMotion?'Pausar movimento 3D':'Retomar movimento 3D';
    send('motion',{enabled:visualMotion});
  });
  $('pr-expand')?.addEventListener('click',async()=>{
    const el=$('pr-visual-panel');
    try {if(document.fullscreenElement)await document.exitFullscreen();else if(el.requestFullscreen)await el.requestFullscreen();}
    catch {setText('pr-view-message','Tela cheia indisponível neste navegador.');}
  });
  $('pr-export-svg')?.addEventListener('click',()=>{
    const svg=$('pr-circuit-svg').cloneNode(true);
    const s=document.createElementNS('http://www.w3.org/2000/svg','style');
    s.textContent='text{font-family:Arial,sans-serif}.is-selected{filter:none}';
    svg.prepend(s);
    const blob=new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='2A-tolva-prensas-esquema-conceitual.svg';a.click();
    root.setTimeout(()=>URL.revokeObjectURL(url),1200);
  });
  main.querySelectorAll('[data-prensa-select]').forEach(item=>{
    item.addEventListener('click',()=>selectEquipment(item.dataset.prensaSelect));
    item.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){e.preventDefault();selectEquipment(item.dataset.prensaSelect);}
    });
  });
  if(simulationAllowed){
    $('pr-sim-start')?.addEventListener('click',()=>{Core.start(state);render();});
    $('pr-sim-pause')?.addEventListener('click',()=>{state.running?Core.pause(state):Core.resume(state);render();});
    $('pr-sim-reset')?.addEventListener('click',()=>{Core.reset(state);render();});
    main.querySelectorAll('input[data-pr-switch]').forEach(item=>item.addEventListener('change',()=>{
      Core.change(state,item.dataset.prSwitch,item.dataset.prKey,item.checked);render();
    }));
    root.setInterval(()=>{if(state.running&&!document.hidden){Core.tick(state,1);render();}},1000);
  }
  root.AutomacaoPrensasDashboard={getSnapshot:()=>Core.snapshot(state),selectEquipment};
  render();selectEquipment('TOLVA');setView('3d');send('ready');
})(typeof window==='undefined'?null:window);
