document.addEventListener('DOMContentLoaded', function () {
  var search = document.getElementById('escala-search');
  var turno = document.getElementById('escala-turno');
  var status = document.getElementById('escala-status');
  var cards = Array.prototype.slice.call(document.querySelectorAll('[data-escala-person]'));
  var rows = Array.prototype.slice.call(document.querySelectorAll('[data-escala-row]'));
  var empty = document.getElementById('escala-filter-empty');
  var cardView = document.getElementById('escala-card-view');
  var tableView = document.getElementById('escala-table-view');

  function matches(el) {
    var q = String(search && search.value || '').trim().toLowerCase();
    var t = String(turno && turno.value || '').trim().toLowerCase();
    var s = String(status && status.value || '').trim().toLowerCase();
    var text = String(el.dataset.search || '').toLowerCase();
    return (!q || text.includes(q)) && (!t || String(el.dataset.turno || '').toLowerCase() === t) && (!s || String(el.dataset.status || '').toLowerCase().includes(s));
  }
  function applyFilters() {
    var visible = 0;
    cards.forEach(function (el) { var ok=matches(el); el.hidden=!ok; if(ok) visible+=1; });
    rows.forEach(function (el) { el.hidden=!matches(el); });
    if (empty) empty.hidden = visible !== 0;
  }
  [search,turno,status].forEach(function(el){ if(el){ el.addEventListener('input',applyFilters); el.addEventListener('change',applyFilters); } });
  document.querySelectorAll('[data-escala-clear]').forEach(function(btn){ btn.addEventListener('click',function(){ if(search)search.value=''; if(turno)turno.value=''; if(status)status.value=''; applyFilters(); }); });
  document.querySelectorAll('[data-view-mode]').forEach(function(btn){ btn.addEventListener('click',function(){ var mode=btn.dataset.viewMode; localStorage.setItem('escala:view',mode); if(cardView)cardView.hidden=mode==='table'; if(tableView)tableView.hidden=mode!=='table'; document.querySelectorAll('[data-view-mode]').forEach(function(b){b.classList.toggle('is-active',b.dataset.viewMode===mode);}); }); });
  var preferred=localStorage.getItem('escala:view')||'cards'; var initial=document.querySelector('[data-view-mode="'+preferred+'"]'); if(initial) initial.click();
});
