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
  const http=window.CGDSimHttp;
  if(!http)return;
  const rows=document.getElementById('sim-remote-rows');
  const CONEXAO={ONLINE:'Online',ATRASADO:'Comunicação atrasada',OFFLINE:'ESP32 offline',SEM_DISPOSITIVO:'Sem ESP32 registrado'};
  const SAIDA=v=>v==='CONFIRMADA'?'Confirmada':v==='NAO_CONFIRMADA'?'Não confirmada':'Não informada';
  const STATUS={PENDENTE:'Pendente',NAO_INFORMADA:'Não informada',DIVERGENTE:'Divergente'};
  const fase=(f,st)=>f&&st==='CONFIRMADA'?f:(f&&st==='DIVERGENTE'?f+' (divergente)':(STATUS[st]||'Pendente'));
  const txt=(v)=>v==null?'—':String(v);
  const ago=(v)=>v==null?'nunca':(v<2?'agora':v+' s atrás');
  async function refreshStatus() {
    if(!rows)return;
    try{
      const data=await http.fetchJson('/automacao/api/simulador/sinaleiros/status');
      if(!Array.isArray(data.digestores))throw Object.assign(new Error(http.MSG.RESPOSTA_INVALIDA),{kind:'RESPOSTA_INVALIDA'});
      const sel=selector.value==='all'?null:Number(selector.value);
      rows.replaceChildren(...data.digestores.filter(d=>sel===null||d.digestor_id===sel).map(d=>{
        const tr=document.createElement('tr');
        tr.dataset.conexao=d.conexao;
        [ 'D'+d.digestor_id, d.fase_solicitada, fase(d.fase_recebida,d.recebida_status), fase(d.fase_aplicada,d.aplicacao_status), SAIDA(d.saida_status), ago(d.ultimo_contato_s), CONEXAO[d.conexao]||d.conexao ]
          .forEach(t=>{const td=document.createElement('td');td.textContent=t;tr.appendChild(td);});
        return tr;
      }));
    }catch(e){
      const td=document.createElement('td');
      td.colSpan=7;td.setAttribute('role','alert');
      td.textContent=(e.kind==='SESSAO_EXPIRADA'||e.kind==='SEM_PERMISSAO'?'':'Status indisponível: ')+e.message;
      const tr=document.createElement('tr');tr.dataset.erro=e.kind||'DESCONHECIDO';tr.appendChild(td);
      rows.replaceChildren(tr);
      if(e.kind==='SESSAO_EXPIRADA'||e.kind==='SEM_PERMISSAO'){halt(e.message);if(statusTimer!==null){clearInterval(statusTimer);statusTimer=null;}}
    }
  }
  // Interrompe renovações; o ESP32 expira o comando sozinho (6,5 s) e desliga as saídas.
  function halt(msg){
    toggle.checked=false;
    if(timer!==null){clearInterval(timer);timer=null;}
    status.textContent=msg+'. Teste remoto interrompido; comandos expiram automaticamente.';
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
      await http.fetchJson('/automacao/api/simulador/sinaleiros',{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json','X-CGD-CSRF':toggle.dataset.csrf},
        body:JSON.stringify({estados}),
      });
      void refreshStatus();
      status.textContent=stopped?'Teste remoto interrompido':'Sincronização de bancada: '+estados.map(e=>'D'+e.digestor_id+' '+e.fase).join(' · ');
    }catch(e){
      halt(e.kind==='SESSAO_EXPIRADA'||e.kind==='CSRF_INVALIDO'?e.message:'Falha na sincronização: '+e.message);
      if(e.kind==='SESSAO_EXPIRADA'||e.kind==='SEM_PERMISSAO'){if(statusTimer!==null){clearInterval(statusTimer);statusTimer=null;}void refreshStatus();}
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
