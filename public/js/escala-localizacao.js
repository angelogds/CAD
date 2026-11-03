(()=>{
  document.querySelectorAll('form[data-geo-context]').forEach(form=>{
    const context=form.dataset.geoContext,button=form.querySelector('[data-geo-submit]');
    const status=form.querySelector('.js-geo-status'),retry=form.querySelector('.js-geo-retry');
    const fields=['latitude','longitude','precisao'].map(k=>form.elements[k+'_'+context]);
    let pending=null,submitting=false;
    const original=button.textContent;
    const clear=()=>{fields.forEach(f=>{f.value='';});button.disabled=true;};
    const capture=()=>{
      if(pending)return pending;
      clear();status.textContent='Obtendo localização…';retry.disabled=true;
      pending=new Promise(resolve=>{
        if(!navigator.geolocation){status.textContent='Localização indisponível neste navegador.';resolve(false);return;}
        navigator.geolocation.getCurrentPosition(position=>{
          const {latitude,longitude,accuracy}=position.coords;
          if(![latitude,longitude,accuracy].every(Number.isFinite)||Math.abs(latitude)>90||Math.abs(longitude)>180||accuracy<0){status.textContent='Localização inválida. Tente novamente.';resolve(false);return;}
          [latitude,longitude,accuracy].forEach((value,i)=>{fields[i].value=value;});
          status.textContent='Localização capturada';button.disabled=form.dataset.before17==='1';resolve(true);
        },error=>{
          clear();status.textContent=error.code===1?'Permita a localização nas configurações do navegador e tente novamente.':error.code===3?'Tempo esgotado. Ative a localização e tente novamente.':'Não foi possível obter a localização. Tente novamente.';resolve(false);
        },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
      }).finally(()=>{pending=null;retry.disabled=false;});
      return pending;
    };
    retry.addEventListener('click',capture);
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(submitting)return;
      if(!form.reportValidity())return;
      submitting=true;button.disabled=true;button.textContent='Validando localização…';
      const valid=await capture();
      if(valid&&form.dataset.before17!=='1')form.submit();
      else {submitting=false;button.textContent=original;button.disabled=true;}
    });
    const os=form.querySelector('[name=os_id]'),descricao=form.querySelector('[name=descricao_servico]');
    const update=()=>{if(descricao)descricao.required=!os?.value;};os?.addEventListener('change',update);update();
    navigator.permissions?.query({name:'geolocation'}).then(permission=>{permission.addEventListener('change',()=>{if(permission.state!=='granted'){clear();status.textContent='Permita a localização para continuar.';}});}).catch(()=>{});
    capture();
  });
  const clock=()=>document.querySelectorAll('.js-extra-clock').forEach(el=>{const start=new Date(el.dataset.start);if(!Number.isFinite(start.getTime()))return;const mins=Math.max(0,Math.floor((Date.now()-start)/60000));el.textContent=Math.floor(mins/60)+'h'+String(mins%60).padStart(2,'0');});clock();setInterval(clock,30000);
})();
