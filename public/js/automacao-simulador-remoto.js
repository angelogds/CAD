/* Canal de bancada opcional separado: a simulação visual continua 100% local. */
(() => {
  'use strict';
  const root=document.getElementById('sim-digestores');
  const toggle=document.getElementById('sim-remote-enable');
  const status=document.getElementById('sim-remote-status');
  const selector=document.getElementById('sim-select-digestor');
  const start=document.getElementById('sim-start');
  if(!root||!toggle||!status||!selector||!start)return;
  let timer=null,busy=false,statusTimer=null;
  const rows=document.getElementById('sim-remote-rows');
  const CONEXAO={ONLINE:'Online',ATRASADO:'Comunicação atrasada',OFFLINE:'Offline',SEM_CONFIRMACAO:'Sem confirmação',SEM_DISPOSITIVO:'Sem ESP32 registrado'};
  const SAIDA=v=>v===true?'Confirmada':v===false?'Não confirmada':'Não informada';
  const txt=(v)=>v==null?'—':String(v);
  const ago=(v)=>v==null?'nunca':(v<2?'agora':v+' s atrás');
  async function refreshStatus() {
    if(!rows)return;
    try{
      const r=await fetch('/automacao/api/simulador/sinaleiros/status',{credentials:'same-origin',cache:'no-store'});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const data=await r.json();
      const sel=selector.value==='all'?null:Number(selector.value);
      rows.replaceChildren(...data.digestores.filter(d=>sel===null||d.digestor_id===sel).map(d=>{
        const tr=document.createElement('tr');
        [ 'D'+d.digestor_id, d.fase_solicitada, txt(d.fase_recebida), txt(d.fase_aplicada), SAIDA(d.saida_confirmada), ago(d.ultimo_contato_s), CONEXAO[d.conexao]||d.conexao ]
          .forEach(t=>{const td=document.createElement('td');td.textContent=t;tr.appendChild(td);});
        return tr;
      }));
    }catch(e){
      rows.replaceChildren(Object.assign(document.createElement('tr'),{innerHTML:'<td colspan="7">Status indisponível ('+e.message+')</td>'}));
    }
  }
  void refreshStatus();
  statusTimer=setInterval(refreshStatus,3000);
  function snapshots(stopped=false) {
    const ids=selector.value==='all'?[1,2,3,4]:[Number(selector.value)];
    return ids.map(id=>{
      const card=root.querySelector('[data-digestor="'+id+'"]');
      const lamp=card && card.querySelector('[data-role="tower"]');
      const stage=lamp && lamp.dataset.stage;
      const fase=stopped||!start.disabled?'PARADO':stage==='green'?'FINAL':stage==='yellow'?'MEIO':'INICIO';
      return {digestor_id:id,fase};
    });
  }
  async function publish(stopped=false) {
    if(busy)return;
    busy=true;
    const estados=snapshots(stopped);
    try{
      const response=await fetch('/automacao/api/simulador/sinaleiros',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json','X-CGD-CSRF':toggle.dataset.csrf},
        body:JSON.stringify({estados}),
      });
      if(!response.ok)throw new Error('HTTP '+response.status);
      void refreshStatus();
      status.textContent=stopped?'Teste remoto interrompido':'Sincronização de bancada: '+estados.map(e=>'D'+e.digestor_id+' '+e.fase).join(' · ');
    }catch(e){
      toggle.checked=false;
      if(timer!==null){clearInterval(timer);timer=null;}
      status.textContent='Erro na sincronização: '+e.message+'; comandos expiram automaticamente.';
    }finally{busy=false;}
  }
  function stop() {
    if(timer!==null){clearInterval(timer);timer=null;}
    if(toggle.checked)void publish(true);
    toggle.checked=false;
  }
  toggle.addEventListener('change',()=>{
    if(toggle.checked){
      if(!confirm('Ativar somente sinais de bancada, com todas as cargas 220 V desconectadas e ESP32 V5 autorizado localmente?')){
        toggle.checked=false;return;
      }
      void publish();
      timer=setInterval(()=>{if(toggle.checked)void publish();},2500);
    }else{
      void publish(true);
      if(timer!==null){clearInterval(timer);timer=null;}
    }
  });
  selector.addEventListener('change',stop);
  document.getElementById('sim-pause').addEventListener('click',()=>{if(toggle.checked)void publish(true);});
  document.getElementById('sim-reset').addEventListener('click',stop);
  window.addEventListener('pagehide',()=>{if(timer!==null)clearInterval(timer);if(statusTimer!==null)clearInterval(statusTimer);},{once:true});
})();
