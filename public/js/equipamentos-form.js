(() => {
  const form = document.querySelector('[data-equipment-form]'); if (!form) return;
  let dirty = false; form.addEventListener('input', () => { dirty = true; update(); });
  const val = n => form.elements[n]?.value || '';
  function update(){
    document.querySelector('[data-preview-name]').textContent=val('nome')||'Nome do equipamento';
    document.querySelector('[data-preview-code]').textContent=val('codigo')||'Código / Tag';
    document.querySelector('[data-preview-sector]').textContent=val('setor')||'Setor não definido';
    document.querySelector('[data-preview-status]').textContent=(val('status_operacional')||'EM_OPERACAO').replaceAll('_',' ');
    document.querySelector('[data-preview-criticality]').textContent=val('criticidade')||'Média';
    const required=['codigo','nome','setor','tipo']; const done=required.filter(n=>val(n).trim()).length;
    document.querySelector('[data-progress]').style.width=`${done/required.length*100}%`;
    document.querySelector('[data-progress-text]').textContent=`${done} de ${required.length} etapas essenciais preenchidas`;
  }
  form.querySelector('[data-cancel]')?.addEventListener('click', e=>{ if(dirty&&!confirm('Descartar alterações não salvas?')) e.preventDefault(); });
  form.querySelector('input[name=foto]')?.addEventListener('change',e=>{const f=e.target.files[0];if(f){document.querySelector('[data-preview-image]').src=URL.createObjectURL(f)}});
  form.addEventListener('submit',()=>{dirty=false}); update();
})();
