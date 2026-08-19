document.addEventListener('DOMContentLoaded', function () {
  var modal = document.getElementById('aviso-modal');
  var form = document.getElementById('aviso-form');
  var title = document.getElementById('aviso-modal-title');
  var publishAtWrap = document.getElementById('aviso-publish-at-wrap');
  var status = document.getElementById('aviso-status');

  function syncSchedule() {
    if (publishAtWrap) publishAtWrap.hidden = !status || status.value !== 'AGENDADO';
  }
  function openModal(data) {
    if (!modal || !form) return;
    form.reset();
    form.action = '/avisos';
    if (title) title.textContent = 'Novo aviso';
    if (data) {
      form.action = '/avisos/' + data.id + '/editar';
      if (title) title.textContent = 'Editar aviso';
      ['titulo','mensagem','categoria','prioridade','status','visible_until'].forEach(function (name) {
        var el = form.elements[name]; if (el && data[name] != null) el.value = String(data[name]).replace(' ', 'T');
      });
      if (form.elements.publish_at && data.publish_at) form.elements.publish_at.value = String(data.publish_at).replace(' ', 'T').slice(0,16);
    }
    syncSchedule();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    setTimeout(function(){ form.elements.titulo && form.elements.titulo.focus(); }, 20);
  }
  function closeModal() { if (!modal) return; modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); }

  document.querySelectorAll('[data-new-aviso]').forEach(function (btn) { btn.addEventListener('click', function(){ openModal(null); }); });
  document.querySelectorAll('[data-edit-aviso]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      try { openModal(JSON.parse(decodeURIComponent(btn.dataset.aviso || ''))); } catch (_e) { openModal(null); }
    });
  });
  document.querySelectorAll('[data-close-aviso]').forEach(function (btn) { btn.addEventListener('click', closeModal); });
  modal && modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  status && status.addEventListener('change', syncSchedule);
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeModal(); });
});
