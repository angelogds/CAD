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
  const solenoids=document.getElementById('sim-solenoids-enable');
  const solenoidsStatus=document.getElementById('sim-solenoids-status');
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
    if(solenoids)solenoids.checked=false;
    if(solenoidsStatus)solenoidsStatus.textContent='Purgadores físicos bloqueados no CAD após interrupção.';
    status.textContent=msg+'. Sincronização interrompida; comandos expiram automaticamente.';
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
      // Auto sincronização nunca arma atuadores: só inclui estados dos relés após
      // confirmação adicional no CAD e liberação física local por canal no ESP32.
      const testeSolenoides=solenoids?.checked===true;
      const camisaVisual=!parado&&card.dataset.camisaSimulada==='ABERTO'?'ABERTO':'FECHADO';
      const eixoVisual=!parado&&card.dataset.eixoSimulado==='ABERTO'?'ABERTO':'FECHADO';
      // Saídas físicas e estados VISUAIS são canais distintos: firmware antigo
      // continua recebendo FECHADO por padrão, inclusive com animação ativa.
      const camisa=testeSolenoides?camisaVisual:'FECHADO';
      const eixo=testeSolenoides?eixoVisual:'FECHADO';
      const mech=window.AutomacaoDigestoresCircuito?.getSnapshot?.();
      const current=mech?.linked===true&&mech.mode==='SIMULACAO'&&!parado;
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
    if(solenoids)solenoids.checked=false;
    if(solenoidsStatus)solenoidsStatus.textContent='Purgadores físicos bloqueados; a simulação visual permanece independente.';
  }
  function connect() {
    if(toggle.checked)return;
    toggle.checked=true;
    status.textContent='Conectando CAD à bancada ESP32…';
    void publish();
    timer=setInterval(()=>{if(toggle.checked)void publish();},1000);
  }
  toggle.addEventListener('change',()=>{
    if(toggle.checked)connectFromToggle();
    else { void publish(true); stop(); }
  });
  function connectFromToggle() {
    // A opção do painel apenas sincroniza as lâmpadas por padrão.
    if(timer!==null)clearInterval(timer);
    status.textContent='Sincronizando luzes, temperatura, purgadores virtuais e guilhotinas; relés físicos bloqueados.';
    void publish();
    timer=setInterval(()=>{if(toggle.checked)void publish();},1000);
  }
  connectButton?.addEventListener('click',()=>{
    void refreshStatus();
    if(!start.disabled) {
      status.textContent='Status consultado. Para enviar a simulação, clique em Iniciar simulação.';
    } else connect();
  });
  solenoids?.addEventListener('change',()=>{
    if(solenoids.checked) {
      if(!confirm('Teste de bancada ISOLADA: as solenóides podem atuar após liberação física LOCAL de cada canal no ESP32. Confirma que não há vapor, pressão, cargas de 220 V em processo ou máquina produtiva conectada?')) {
        solenoids.checked=false;
        return;
      }
      if(solenoidsStatus)solenoidsStatus.textContent='Estados de purgadores habilitados no CAD; a autorização física por canal continua obrigatória no ESP32.';
    } else if(solenoidsStatus)solenoidsStatus.textContent='Somente os relés físicos estão bloqueados; purgadores virtuais continuam espelhados.';
    if(toggle.checked)void publish(!start.disabled);
  });
  start.addEventListener('click',()=>{if(autoSync?.checked!==false)connect();});
  root.addEventListener('simulador:estado',()=>{if(toggle.checked)void publish();});
  selector.addEventListener('change',stop);
  document.getElementById('sim-pause').addEventListener('click',stop);
  document.getElementById('sim-reset').addEventListener('click',stop);
  window.addEventListener('pagehide',()=>{if(timer!==null)clearInterval(timer);if(statusTimer!==null)clearInterval(statusTimer);clearInterval(validadeTimer);},{once:true});
})();
