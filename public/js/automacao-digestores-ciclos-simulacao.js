/* Guarda apenas ciclos virtuais COMPLETOS. Não há atribuição de funcionário. */
(() => {
 'use strict';
 const root=document.getElementById('sim-digestores');
 const token=root?.dataset?.ciclosCsrf;
 const status=document.getElementById('sim-cycles-storage-status');
 if(!root||!token||!status)return;
 const times=new Map();
 const sent=new Set();
 let run=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
 let lastSeconds=-1;
 let writing=Promise.resolve();
 const feedback=message=>{status.textContent=message;};
 function reset(){
   run=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
   times.clear();sent.clear();lastSeconds=-1;
   feedback('Histórico virtual: gravação ativa. Sem contabilizar produção real.');
 }
 function consume(s){
   if(!s || s.mode!=='SIMULACAO' || s.linked!==true)return;
   const second=Number(s.seconds);
   if(!Number.isFinite(second))return;
   if(lastSeconds>=0 && second+0.01<lastSeconds)reset();
   lastSeconds=second;
   const id=s.activeDigestor;
   if(id && /^D[1-4]$/.test(id)) {
     const phaseStart=second-(Number(s.stageSeconds)||0);
     let clock=times.get(id);
     if(!clock){clock={carga:s.stage==='CARGA'?phaseStart:0,cozimento:null,descarga:null,transferencia:null};times.set(id,clock);}
     if(s.stage==='COZIMENTO' && clock.cozimento==null)clock.cozimento=phaseStart;
     if(s.stage==='DESCARGA' && clock.descarga==null)clock.descarga=phaseStart;
     if(s.stage==='TRANSFERENCIA' && clock.transferencia==null)clock.transferencia=phaseStart;
   }
   for(const done of s.completed||[]){
     if(sent.has(done))continue;
     const clock=times.get(done);
     if(!clock || clock.cozimento==null || clock.descarga==null || clock.transferencia==null)continue;
     sent.add(done);
     const durations={
       carga_s:clock.cozimento-clock.carga,
       cozimento_s:clock.descarga-clock.cozimento,
       descarga_s:clock.transferencia-clock.descarga,
       transferencia_s:(s.stage==='CARGA' ? second-(Number(s.stageSeconds)||0) : second)-clock.transferencia
     };
     if(Object.values(durations).some(v=>!Number.isFinite(v)||v<0||v>86400))continue;
     const digestor_id=Number(done.substring(1));
     const key=run+':'+done;
     writing=writing.then(async()=>{
       const response=await fetch('/automacao/api/digestores/ciclos/simulacao',{
         method:'POST',cache:'no-store',credentials:'same-origin',
         headers:{'Content-Type':'application/json','Accept':'application/json','X-CGD-Ciclos-CSRF':token},
         body:JSON.stringify({key,digestor_id,...durations})
       });
       const data=await response.json();
       if(!response.ok||!data.ok)throw Error(data.error||data.code||'Falha no registro');
       feedback('Histórico virtual: '+done+' registrado em relatório de SIMULAÇÃO. Produção real inalterada.');
     }).catch(e=>feedback('Não foi possível gravar '+done+': '+e.message));
   }
 }
 window.addEventListener('digestores-circuito:state',event=>consume(event.detail));
 document.getElementById('sim-reset')?.addEventListener('click',reset);
 reset();
})();
