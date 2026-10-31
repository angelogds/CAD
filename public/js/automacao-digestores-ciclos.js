(() => {
  'use strict';
  const root=document.getElementById('digestores-ciclos');
  if(!root)return;
  const token=root.dataset.csrf;
  const feedback=document.getElementById('cy-feedback');
  const inform=message=>{if(feedback)feedback.textContent=message;};
  let locked=false;
  async function submit(url,body){
    if(locked)return;
    locked=true;
    root.querySelectorAll('button.cy-action,#cy-start button[type="submit"]').forEach(b=>b.disabled=true);
    try{
      const response=await fetch(url,{method:'POST',cache:'no-store',
        headers:{'Accept':'application/json','Content-Type':'application/json','X-CGD-Ciclos-CSRF':token},
        credentials:'same-origin',body:JSON.stringify(body)});
      const payload=await response.json();
      if(!response.ok||!payload.ok)throw Error(payload.error||payload.code||'Falha ao registrar ciclo.');
      window.location.reload();
    }catch(error){
      inform('Registro não realizado: '+error.message);
    }finally{
      locked=false;
      root.querySelectorAll('button.cy-action,#cy-start button[type="submit"]').forEach(b=>b.disabled=false);
    }
  }
  document.getElementById('cy-start')?.addEventListener('submit',event=>{
    event.preventDefault();
    const form=event.currentTarget,body=Object.fromEntries(new FormData(form));
    if(!body.colaborador_id){inform('Selecione o funcionário responsável pelo carregamento.');return;}
    if(!confirm('Confirmar apontamento REAL: o carregamento deste digestor está começando agora?'))return;
    void submit('/automacao/api/digestores/ciclos',body);
  });
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-action][data-id]');
    if(!button||!root.contains(button))return;
    const action=button.dataset.action,id=button.dataset.id;
    const label={INICIAR_COZIMENTO:'carregamento terminou e o cozimento começou',INICIAR_DESCARGA:'cozimento terminou e a descarga começou',
      CONCLUIR:'a descarga terminou e o ciclo foi concluído',CANCELAR:'o ciclo deve ser cancelado'}[action];
    if(!label||!confirm('Confirmar apontamento REAL: '+label+'?'))return;
    void submit('/automacao/api/digestores/ciclos/'+encodeURIComponent(id)+'/etapa',{action});
  });
})();
