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
  const http=window.CGDBancadaHttp;
  if(!http){status.textContent='Erro: módulo de comunicação da bancada não carregado';return;}
  const CONEXAO={ONLINE:'Online',ATRASADO:'Comunicação atrasada',OFFLINE:'ESP32 offline',SEM_DISPOSITIVO:'Sem ESP32 registrado'};
  const SAIDA=v=>v==='CONFIRMADA'?'Confirmada':v==='NAO_CONFIRMADA'?'Não confirmada':'Não informada';
  const STATUS={PENDENTE:'Pendente',NAO_INFORMADA:'Não informada',DIVERGENTE:'Divergente'};
  const fase=(f,st)=>f&&st==='CONFIRMADA'?f:(f&&st==='DIVERGENTE'?f+' (divergente)':(STATUS[st]||'Pendente'));
  const txt=(v)=>v==null?'—':String(v);
  const ago=(v)=>v==null?'nunca':(v<2?'agora':v+' s atrás');
  function falhaComunicacao(e) {
    // Interrompe renovações; o firmware desliga as saídas ao expirar o comando (6,5 s).
    toggle.checked=false;
    if(timer!==null){clearInterval(timer);timer=null;}
    status.textContent=(e.kind==='sessao'?'Sessão expirada — entre novamente no CAD':'Erro na sincronização: '+e.message)+'. Renovações interrompidas; comandos expiram automaticamente.';
  }
  async function refreshStatus() {
    if(!rows)return;
    try{
      const data=await http.fetchJson('/automacao/api/simulador/sinaleiros/status');
      if(!Array.isArray(data.digestores))throw new http.BancadaError('resposta','Resposta inesperada do servidor (sem digestores)');
      const sel=selector.value==='all'?null:Number(selector.value);
      rows.replaceChildren(...data.digestores.filter(d=>sel===null||d.digestor_id===sel).map(d=>{
        const tr=document.createElement('tr');
        [ 'D'+d.digestor_id, d.fase_solicitada, fase(d.fase_recebida,d.recebida_status), fase(d.fase_aplicada,d.aplicacao_status), SAIDA(d.saida_status), ago(d.ultimo_contato_s), CONEXAO[d.conexao]||d.conexao ]
          .forEach(t=>{const td=document.createElement('td');td.textContent=t;tr.appendChild(td);});
        return tr;
      }));
    }catch(e){
      const tr=document.createElement('tr'),td=document.createElement('td');
      td.colSpan=7;
      td.textContent=(e.kind==='sessao'?'Sessão expirada — entre novamente no CAD':e.kind==='servidor'?'Erro do servidor: ':'Supervisão indisponível: ')+(e.kind==='sessao'?'':e.message);
      td.dataset.erro=e.kind||'desconhecido';
      tr.appendChild(td);rows.replaceChildren(tr);
      if(e.kind==='sessao'||e.kind==='permissao')falhaComunicacao(e);
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
      const resp=await http.fetchJson('/automacao/api/simulador/sinaleiros',{
        method:'POST',
        headers:{'Content-Type':'application/json','X-CGD-CSRF':toggle.dataset.csrf},
        body:JSON.stringify({estados}),
      });
      if(resp.ok===false||!Array.isArray(resp.estados))throw new http.BancadaError('resposta',resp.error||'Publicação não confirmada pelo servidor');
      void refreshStatus();
      status.textContent=stopped?'Teste remoto interrompido':'Sincronização de bancada: '+estados.map(e=>'D'+e.digestor_id+' '+e.fase).join(' · ');
    }catch(e){
      falhaComunicacao(e);
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
