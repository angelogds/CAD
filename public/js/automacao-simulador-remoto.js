/* Canal de bancada opcional separado: a simulação visual continua 100% local. */
(() => {
  'use strict';
  const root=document.getElementById('sim-digestores');
  const toggle=document.getElementById('sim-remote-enable');
  const status=document.getElementById('sim-remote-status');
  const selector=document.getElementById('sim-select-digestor');
  const start=document.getElementById('sim-start');
  const autoSync=document.getElementById('sim-auto-sync');
  const connectButton=document.getElementById('sim-connect-esp32');
  const realButton=document.getElementById('sim-real-components');
  const realFeedback=document.getElementById('sim-real-feedback');
  let canTestComponents=false;
  if(!root||!toggle||!status||!selector||!start)return;
  let timer=null,busy=false,statusTimer=null;
  let pending=null,queuedStop=null,epoch=0;
  const publishedIds=new Set();
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
  function syncRealButton(message) {
    if(!realButton)return;
    realButton.disabled=!toggle.checked&&!canTestComponents;
    realButton.setAttribute('aria-pressed',String(toggle.checked));
    realButton.textContent=toggle.checked?'S · Encerrar teste real':'S · Simulação real';
    if(realFeedback)realFeedback.textContent=message||(toggle.checked?
      (start.disabled?'Relés vinculados ao ciclo':'Preparado · clique em Iniciar'):
      canTestComponents?'Visual · relés não vinculados':'ESP32 indisponível para teste');
  }
  function renderStatus() {
    if(!rows)return;
    const ui=window.AutomacaoTelemetriaUI;
    const digestores=ui&&recebidoEm!==null?ui.expirar(ultimoStatus,(Date.now()-recebidoEm)/1000):ultimoStatus;
      const sel=selector.value==='all'?null:Number(selector.value);
      const matched=digestores.filter(d=>sel===null||d.digestor_id===sel);
      canTestComponents=matched.some(d=>d.conexao==='ONLINE'&&d.origem!=='REAL')&&
        !matched.some(d=>d.origem==='REAL');
      if(realButton&&toggle.checked&&!canTestComponents)stop('Comunicação indisponível ou ESP32 em operação REAL. Teste interrompido.');
      syncRealButton();
      if(indicator){
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
      ultimoStatus=[];recebidoEm=null;canTestComponents=false;
      if(realButton&&toggle.checked)stop('Sem confirmação de comunicação. Teste interrompido.');
      syncRealButton('Sem comunicação com ESP32');
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
    epoch++;
    pending=null;
    queuedStop=null;
    toggle.checked=false;
    if(timer!==null){clearInterval(timer);timer=null;}
    status.textContent=msg+'. Sincronização interrompida; comandos expiram automaticamente.';
    syncRealButton('Teste interrompido · comandos expiram');
  }
  void refreshStatus();
  statusTimer=setInterval(refreshStatus,1000);
  const validadeTimer=setInterval(()=>{if(recebidoEm!==null)renderStatus();},1000);
  const selectedIds=()=>selector.value==='all'?[1,2,3,4]:[Number(selector.value)];
  function snapshots(stopped=false,ids=selectedIds()) {
    const mech=stopped?null:window.AutomacaoDigestoresCircuito?.getSnapshot?.();
    return ids.map(id=>{
      const card=root.querySelector('[data-digestor="'+id+'"]');
      const valor=card && card.dataset.temperaturaC;
      const temperatura=typeof valor==='string'&&valor.trim()!==''?Number(valor):NaN;
      const valido=Number.isFinite(temperatura)&&temperatura>=0&&temperatura<=850;
      const parado=stopped||!start.disabled||!valido;
      const fase=parado?'PARADO':temperatura>120?'FINAL':temperatura>50?'MEIO':'INICIO';
      // O canal legado de solenóides permanece fechado. A V12 usa somente os
      // estados visuais para reles de teste, com permissivo e intertravamentos locais.
      const camisaVisual=!parado&&card.dataset.camisaSimulada==='ABERTO'?'ABERTO':'FECHADO';
      const eixoVisual=!parado&&card.dataset.eixoSimulado==='ABERTO'?'ABERTO':'FECHADO';
      // Saídas físicas e estados VISUAIS são canais distintos: firmware antigo
      // continua recebendo FECHADO por padrão, inclusive com animação ativa.
      const camisa='FECHADO',eixo='FECHADO';
      const current=mech?.linked===true&&mech.mode==='SIMULACAO'&&mech.running===true&&!parado;
      const carga=current&&mech.gates?.[id-1]===true?'ABERTA':'FECHADA';
      const descarga=current&&mech.dischargeGates?.[id-1]===true?'ABERTA':'FECHADA';
      const stage=current&&mech.activeDigestor==='D'+id?mech.stage:'PARADO';
      // Motor e empurradores do CAD são estados VISUAIS, não ordens de energia.
      const isCooking=current&&mech.activeDigestor==='D'+id&&stage==='COZIMENTO'&&mech.running===true;
      const empurradores={camisa:isCooking?camisaVisual:'FECHADO',eixo:isCooking?eixoVisual:'FECHADO'};
      const espelho=mech?{purgadores_visuais:{camisa:camisaVisual,eixo:eixoVisual},
        guilhotinas_simuladas:{carga,descarga},empurradores_simulados:empurradores,
        motor_digestor_simulado:isCooking,etapa_mecanica:stage}:{};
      return {digestor_id:id,fase,...(!parado&&Number.isFinite(temperatura)?{temperatura_c:temperatura}:{}),
        aquecimento_simulado:!parado&&card.dataset.aquecimentoSimulado==='true',
        purgadores_simulados:{camisa,eixo},...espelho};
    });
  }
  async function publish(stopped=false) {
    // Uma parada não pode ser descartada enquanto há um POST em andamento.
    // O último estado substitui renovações pendentes; os IDs anteriores são
    // preservados até o POST de parada, inclusive depois de trocar a seleção.
    if(stopped){
      queuedStop={stopped:true,ids:[...new Set([...(queuedStop?.ids||[]),...publishedIds,...selectedIds()])],epoch};
      pending=null;
    }else pending={stopped:false,ids:selectedIds(),epoch};
    if(busy)return;
    busy=true;
    try{
      while(queuedStop||pending){
        const request=queuedStop||pending;
        if(queuedStop)queuedStop=null;else pending=null;
        const estados=snapshots(request.stopped,request.ids);
        const retired=request.stopped?request.ids:[...publishedIds].filter(id=>!request.ids.includes(id));
        if(!request.stopped){
          estados.push(...snapshots(true,retired));
          request.ids.forEach(id=>publishedIds.add(id));
        }
        await http.fetchJson('/automacao/api/simulador/sinaleiros',{
          method:'POST',
          headers:{'Content-Type':'application/json','Accept':'application/json','X-CGD-CSRF':toggle.dataset.csrf},
          body:JSON.stringify({estados}),
          keepalive:request.stopped,
        });
        retired.forEach(id=>publishedIds.delete(id));
        // Status tem cadencia propria; nao repetir um GET a cada publicacao/evento.
        if(request.epoch===epoch&&(request.stopped||toggle.checked))
          status.textContent=request.stopped?'Teste remoto interrompido':'Componentes isolados · comandos de relés: '+estados.map(e=>'D'+e.digestor_id+' '+e.fase).join(' · ');
        syncRealButton();
      }
    }catch(e){
      halt(e.kind==='SESSAO_EXPIRADA'||e.kind==='CSRF_INVALIDO'?e.message:'Falha na sincronização: '+e.message);
      if(e.kind==='SESSAO_EXPIRADA'||e.kind==='SEM_PERMISSAO'){if(statusTimer!==null){clearInterval(statusTimer);statusTimer=null;}void refreshStatus();}
    }finally{busy=false;}
  }
  function stop(message) {
    epoch++;
    if(timer!==null){clearInterval(timer);timer=null;}
    if(toggle.checked||publishedIds.size)void publish(true);
    toggle.checked=false;
    if(typeof message==='string')status.textContent=message;
    syncRealButton();
  }
  function connect() {
    if(toggle.checked)return;
    if(realButton&&!canTestComponents){status.textContent='Aguarde um ESP32 online em modo de teste.';syncRealButton();return;}
    toggle.checked=true;
    syncRealButton();
    status.textContent='Vinculando relés dos componentes isolados ao CAD…';
    void publish();
    timer=setInterval(()=>{if(toggle.checked)void publish();},1000);
  }
  toggle.addEventListener('change',()=>{
    if(toggle.checked)connectFromToggle();
    else stop();
  });
  function connectFromToggle() {
    // Compatibilidade com o controle interno: a ação visível é S · Simulação real.
    if(timer!==null)clearInterval(timer);
    if(realButton&&!canTestComponents){toggle.checked=false;syncRealButton();return;}
    syncRealButton();
    status.textContent='Teste dos relés de componentes isolados; selecione Simulação CAD na IHM ESP32.';
    void publish();
    timer=setInterval(()=>{if(toggle.checked)void publish();},1000);
  }
  connectButton?.addEventListener('click',()=>{
    void refreshStatus();
    status.textContent='Conexão consultada. Use S · Simulação real para vincular os relés.';
  });
  realButton?.addEventListener('click',()=>{if(toggle.checked)stop();else connect();});
  start.addEventListener('click',()=>{if(autoSync?.checked===true)connect();syncRealButton();});
  root.addEventListener('simulador:estado',()=>{if(toggle.checked)void publish();});
  selector.addEventListener('change',stop);
  document.getElementById('sim-pause').addEventListener('click',stop);
  document.getElementById('sim-reset').addEventListener('click',stop);
  window.addEventListener('pagehide',()=>{stop();if(statusTimer!==null)clearInterval(statusTimer);clearInterval(validadeTimer);},{once:true});
})();
