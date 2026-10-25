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
  const indicator=document.getElementById('sim-hardware-indicator');
  const CONEXAO={ONLINE:'Online',ATRASADO:'Comunicação atrasada',OFFLINE:'ESP32 offline',SEM_DISPOSITIVO:'Sem ESP32 registrado'};
  const SAIDA=v=>v==='CONFIRMADA'?'Confirmada':v==='NAO_CONFIRMADA'?'Não confirmada':'Não informada';
  const STATUS={PENDENTE:'Pendente',NAO_INFORMADA:'Não informada',DIVERGENTE:'Divergente'};
  const fase=(f,st)=>f&&st==='CONFIRMADA'?f:(f&&st==='DIVERGENTE'?f+' (divergente)':(STATUS[st]||'Pendente'));
  const txt=(v)=>v==null?'—':String(v);
  const ago=(v)=>v==null?'nunca':(v<2?'agora':v+' s atrás');
  let ultimoStatus=[],recebidoEm=null,statusBusy=false;
  function renderStatus() {
    const ui=window.AutomacaoTelemetriaUI;
    const digestores=ui&&recebidoEm!==null?ui.expirar(ultimoStatus,(Date.now()-recebidoEm)/1000):ultimoStatus;
      const sel=selector.value==='all'?null:Number(selector.value);
      if(indicator){
        const matched=digestores.filter(d=>sel===null||d.digestor_id===sel);
        const online=matched.filter(d=>d.conexao==='ONLINE').length;
        const reais=matched.filter(d=>d.origem==='REAL').length;
        indicator.textContent=reais ? 'SIMULAÇÃO VISUAL • '+reais+' ESP32 EM OPERAÇÃO REAL (SUPERVISÃO)' : online
          ? 'SIMULAÇÃO • '+online+' ESP32 ONLINE'+(toggle.checked?' • SINCRONIZANDO':' • NÃO SINCRONIZADO')
          : 'SIMULAÇÃO • ESP32 '+(matched.some(d=>d.conexao==='ATRASADO')?'COMUNICAÇÃO ATRASADA':matched.some(d=>d.conexao==='OFFLINE')?'OFFLINE':'NÃO CADASTRADO');
        indicator.dataset.conexao=online?'online':'offline';
      }
      rows.replaceChildren(...digestores.filter(d=>sel===null||d.digestor_id===sel).map(d=>{
        const tr=document.createElement('tr');
        tr.dataset.conexao=d.conexao;
        const p=ui?ui.apresentacao(d):null;
        [ 'D'+d.digestor_id, d.origem==='REAL'?'REAL':'SIMULAÇÃO',
          p?p.temperatura:'—',
          p?p.faixa:txt(d.faixa_temperatura), p?p.cor+(p.ready?' • '+p.pronto:''):txt(d.cor_sinaleiro), p?p.sensor:txt(d.sensor_status),
          d.origem==='REAL'?'Decisão local':d.fase_solicitada, d.origem==='REAL'?'—':fase(d.fase_recebida,d.recebida_status),
          d.origem==='REAL'?'Informada pelo ESP32':fase(d.fase_aplicada,d.aplicacao_status), SAIDA(d.saida_status), ago(d.ultimo_contato_s), CONEXAO[d.conexao]||d.conexao ]
          .forEach(t=>{const td=document.createElement('td');td.textContent=t;tr.appendChild(td);});
        return tr;
      }));
  }
  async function refreshStatus() {
    if(!rows||statusBusy)return;
    statusBusy=true;
    const solicitadoEm=Date.now();
    try{
      const data=await http.fetchJson('/automacao/api/simulador/sinaleiros/status');
      if(!Array.isArray(data.digestores))throw Object.assign(new Error(http.MSG.RESPOSTA_INVALIDA),{kind:'RESPOSTA_INVALIDA'});
      ultimoStatus=data.digestores;recebidoEm=solicitadoEm;
      renderStatus();
    }catch(e){
      ultimoStatus=[];recebidoEm=null;
      if(indicator){indicator.textContent='SIMULAÇÃO • STATUS ESP32 INDISPONÍVEL';indicator.dataset.conexao='erro';}
      const td=document.createElement('td');
      td.colSpan=12;td.setAttribute('role','alert');
      td.textContent=(e.kind==='SESSAO_EXPIRADA'||e.kind==='SEM_PERMISSAO'?'':'Status indisponível: ')+e.message;
      const tr=document.createElement('tr');tr.dataset.erro=e.kind||'DESCONHECIDO';tr.appendChild(td);
      rows.replaceChildren(tr);
      if(e.kind==='SESSAO_EXPIRADA'||e.kind==='SEM_PERMISSAO'){halt(e.message);if(statusTimer!==null){clearInterval(statusTimer);statusTimer=null;}}
    }finally{statusBusy=false;}
  }
  // Interrompe renovações; o ESP32 expira o comando sozinho (6,5 s) e desliga as saídas.
  function halt(msg){
    toggle.checked=false;
    if(timer!==null){clearInterval(timer);timer=null;}
    status.textContent=msg+'. Teste remoto interrompido; comandos expiram automaticamente.';
  }
  void refreshStatus();
  statusTimer=setInterval(refreshStatus,3000);
  const validadeTimer=setInterval(()=>{if(recebidoEm!==null)renderStatus();},1000);
  function snapshots(stopped=false) {
    const ids=selector.value==='all'?[1,2,3,4]:[Number(selector.value)];
    return ids.map(id=>{
      const card=root.querySelector('[data-digestor="'+id+'"]');
      const valor=card && card.dataset.temperaturaC;
      const temperatura=typeof valor==='string'&&valor.trim()!==''?Number(valor):NaN;
      const valido=Number.isFinite(temperatura)&&temperatura>=0&&temperatura<=850;
      const parado=stopped||!start.disabled||!valido;
      const fase=parado?'PARADO':temperatura>120?'FINAL':temperatura>50?'MEIO':'INICIO';
      const camisa=!parado&&card.dataset.camisaSimulada==='ABERTO'?'ABERTO':'FECHADO';
      const eixo=!parado&&card.dataset.eixoSimulado==='ABERTO'?'ABERTO':'FECHADO';
      return {digestor_id:id,fase,...(!parado&&Number.isFinite(temperatura)?{temperatura_c:temperatura}:{}),
        aquecimento_simulado:!parado&&card.dataset.aquecimentoSimulado==='true',
        purgadores_simulados:{camisa,eixo}};
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
      if(!confirm('Sincronizar temperatura, sinaleiros e estados simulados com o ESP32? Solenoides de bancada só respondem após autorização local por canal. Mantenha cargas industriais desconectadas.')){
        toggle.checked=false;return;
      }
      void publish();
      timer=setInterval(()=>{if(toggle.checked)void publish();},1000);
    }else{
      void publish(true);
      if(timer!==null){clearInterval(timer);timer=null;}
    }
  });
  root.addEventListener('simulador:estado',()=>{if(toggle.checked)void publish();});
  selector.addEventListener('change',stop);
  document.getElementById('sim-pause').addEventListener('click',()=>{if(toggle.checked)void publish(true);});
  document.getElementById('sim-reset').addEventListener('click',stop);
  window.addEventListener('pagehide',()=>{if(timer!==null)clearInterval(timer);if(statusTimer!==null)clearInterval(statusTimer);clearInterval(validadeTimer);},{once:true});
})();
