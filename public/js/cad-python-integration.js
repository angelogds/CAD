function formatNumber(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function drawingId() {
  return window.CAD_INITIAL?.desenhoId || null;
}

function createModal() {
  if (document.getElementById('cadPythonModal')) return document.getElementById('cadPythonModal');
  const modal = document.createElement('div');
  modal.id = 'cadPythonModal';
  modal.className = 'cad-python-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="cad-python-backdrop" data-python-close></div>
    <section class="cad-python-dialog" role="dialog" aria-modal="true" aria-labelledby="cadPythonTitle">
      <header><div><small>CAD PYTHON ENGINE</small><strong id="cadPythonTitle">Análise técnica do desenho</strong></div><button type="button" data-python-close aria-label="Fechar">×</button></header>
      <div class="cad-python-form">
        <label>Espessura da peça (mm)<input id="cadPythonThickness" type="number" min="0" step="0.1" placeholder="Opcional para cálculo de peso"></label>
        <label>Densidade (kg/m³)<input id="cadPythonDensity" type="number" min="0" step="1" placeholder="Opcional; material conhecido é inferido"></label>
        <button id="cadPythonRun" type="button">Executar análise</button>
      </div>
      <div id="cadPythonResult" class="cad-python-result"><p>Informe a espessura se quiser estimar o peso e execute a análise.</p></div>
    </section>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-python-close]').forEach((el) => el.addEventListener('click', () => { modal.hidden = true; }));
  modal.querySelector('#cadPythonRun')?.addEventListener('click', runAnalysis);
  return modal;
}

function installStyles() {
  if (document.getElementById('cadPythonStyles')) return;
  const style = document.createElement('style');
  style.id = 'cadPythonStyles';
  style.textContent = `
    .cad-python-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 7px;border:1px solid #5b6672;border-radius:3px;font:700 10px/1 system-ui;color:#cbd5e1;background:#202833}.cad-python-badge::before{content:'';width:6px;height:6px;border-radius:50%;background:#f59e0b}.cad-python-badge.online::before{background:#22c55e}.cad-python-badge.offline{opacity:.65}.cad-python-action{white-space:nowrap}.cad-python-modal{position:fixed;inset:0;z-index:9999}.cad-python-backdrop{position:absolute;inset:0;background:rgba(2,6,23,.7)}.cad-python-dialog{position:relative;margin:8vh auto 0;width:min(760px,92vw);max-height:82vh;overflow:auto;background:#111827;color:#e5e7eb;border:1px solid #475569;border-radius:8px;box-shadow:0 24px 80px rgba(0,0,0,.45)}.cad-python-dialog header{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #334155;background:#1f2937}.cad-python-dialog header div{display:flex;flex-direction:column;gap:2px}.cad-python-dialog header small{color:#60a5fa;font-weight:800;letter-spacing:.08em}.cad-python-dialog header strong{font-size:16px}.cad-python-dialog header button{border:0;background:transparent;color:#e5e7eb;font-size:25px;cursor:pointer}.cad-python-form{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;padding:14px 16px;border-bottom:1px solid #334155}.cad-python-form label{display:flex;flex-direction:column;gap:5px;font-size:11px;color:#94a3b8}.cad-python-form input{height:34px;border:1px solid #475569;border-radius:4px;background:#0f172a;color:#e5e7eb;padding:0 9px}.cad-python-form button{align-self:end;height:34px;border:1px solid #2563eb;border-radius:4px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer}.cad-python-result{padding:16px}.cad-python-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.cad-python-kpi{padding:10px;border:1px solid #334155;border-radius:5px;background:#0f172a}.cad-python-kpi small{display:block;color:#94a3b8;font-size:9px;text-transform:uppercase}.cad-python-kpi strong{display:block;margin-top:4px;font-size:17px}.cad-python-score.good{color:#4ade80}.cad-python-score.warn{color:#fbbf24}.cad-python-score.bad{color:#fb7185}.cad-python-issues{margin:14px 0 0;padding:0;list-style:none}.cad-python-issues li{padding:8px 9px;border-bottom:1px solid #263244;font-size:12px}.cad-python-issues li.error{color:#fda4af}.cad-python-issues li.warning{color:#fde68a}.cad-python-note{margin-top:12px;color:#94a3b8;font-size:11px}@media(max-width:760px){.cad-python-form{grid-template-columns:1fr}.cad-python-kpis{grid-template-columns:1fr 1fr}.cad-python-dialog{margin-top:3vh}}`;
  document.head.appendChild(style);
}

async function checkStatus(badge, actions) {
  const id = drawingId();
  if (!id) return;
  try {
    const res = await fetch(`/desenho-tecnico/cad/${id}/python/status`, { headers: { Accept: 'application/json' } });
    const data = await res.json();
    const online = Boolean(res.ok && data.ok && data.available !== false);
    badge.textContent = online ? 'PYTHON ONLINE' : 'PYTHON OFFLINE';
    badge.classList.toggle('online', online);
    badge.classList.toggle('offline', !online);
    actions.forEach((el) => { el.disabled = !online; el.title = online ? el.dataset.onlineTitle || el.title : 'CAD Python Engine indisponível ou não configurado'; });
  } catch (_e) {
    badge.textContent = 'PYTHON OFFLINE';
    badge.classList.add('offline');
    actions.forEach((el) => { el.disabled = true; });
  }
}

async function runAnalysis() {
  const id = drawingId();
  const result = document.getElementById('cadPythonResult');
  const button = document.getElementById('cadPythonRun');
  if (!id || !result) return;
  button.disabled = true;
  result.innerHTML = '<p>Processando geometria…</p>';
  try {
    const thickness = Number(document.getElementById('cadPythonThickness')?.value || 0) || null;
    const density = Number(document.getElementById('cadPythonDensity')?.value || 0) || null;
    const res = await fetch(`/desenho-tecnico/cad/${id}/analisar`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ thickness_mm: thickness, density_kg_m3: density }) });
    const payload = await res.json();
    if (!res.ok || !payload.ok) throw new Error(payload.error || 'Falha na análise técnica.');
    const analysis = payload.data?.data || payload.data || {};
    const validation = analysis.validation || {};
    const metrics = analysis.metrics || {};
    const scoreClass = Number(validation.score) >= 90 ? 'good' : Number(validation.score) >= 70 ? 'warn' : 'bad';
    const issues = (validation.issues || []).map((issue) => `<li class="${issue.severity}"><strong>${issue.code}</strong> — ${issue.message}</li>`).join('');
    result.innerHTML = `
      <div class="cad-python-kpis">
        <div class="cad-python-kpi"><small>Validação</small><strong class="cad-python-score ${scoreClass}">${formatNumber(validation.score,0)}%</strong></div>
        <div class="cad-python-kpi"><small>Área fechada</small><strong>${formatNumber(metrics.area_m2,4)} m²</strong></div>
        <div class="cad-python-kpi"><small>Perímetro</small><strong>${formatNumber(metrics.perimeter_m,3)} m</strong></div>
        <div class="cad-python-kpi"><small>Comprimento linear</small><strong>${formatNumber(metrics.linear_length_m,3)} m</strong></div>
        <div class="cad-python-kpi"><small>Peso estimado</small><strong>${metrics.estimated_mass_kg == null ? '—' : `${formatNumber(metrics.estimated_mass_kg,2)} kg`}</strong></div>
      </div>
      ${issues ? `<ul class="cad-python-issues">${issues}</ul>` : '<p class="cad-python-note">Nenhuma inconsistência geométrica detectada pelas regras atuais.</p>'}
      <p class="cad-python-note">Objetos: ${metrics.entities || 0} • Contornos fechados: ${metrics.closed_contours || 0} • Hachuras: ${metrics.hatch_entities || 0}${metrics.density_kg_m3 ? ` • Densidade: ${formatNumber(metrics.density_kg_m3,0)} kg/m³ (${metrics.density_source || 'informada'})` : ''}</p>`;
  } catch (error) {
    result.innerHTML = `<p style="color:#fda4af">${error.message}</p>`;
  } finally {
    button.disabled = false;
  }
}

async function importDxf(fileInput) {
  const id = drawingId();
  const file = fileInput.files?.[0];
  if (!id || !file) return;
  if (!confirm('Importar este DXF e adicionar a geometria ao desenho atual? O histórico/undo continuará preservado após o salvamento.')) { fileInput.value = ''; return; }
  const body = new FormData();
  body.append('dxf', file);
  try {
    const res = await fetch(`/desenho-tecnico/cad/${id}/dxf/importar`, { method: 'POST', body, headers: { Accept: 'application/json' } });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Falha ao importar DXF.');
    const warningText = (data.warnings || []).length ? `\nAvisos: ${(data.warnings || []).slice(0, 4).join(' | ')}` : '';
    alert(`${data.imported || 0} objeto(s) importado(s).${warningText}`);
    window.location.reload();
  } catch (error) {
    alert(error.message);
  } finally {
    fileInput.value = '';
  }
}

function install() {
  const id = drawingId();
  const actionsHost = document.querySelector('.cad-appbar-actions');
  if (!id || !actionsHost || actionsHost.querySelector('[data-cad-python]')) return;
  installStyles();
  createModal();

  const badge = document.createElement('span');
  badge.className = 'cad-python-badge offline';
  badge.dataset.cadPython = 'badge';
  badge.textContent = 'PYTHON…';

  const analyze = document.createElement('button');
  analyze.type = 'button'; analyze.className = 'cad-btn cad-btn-secondary cad-python-action'; analyze.textContent = 'Analisar'; analyze.dataset.onlineTitle = 'Validar geometria e calcular métricas';
  analyze.addEventListener('click', () => { document.getElementById('cadPythonModal').hidden = false; });

  const exportDxf = document.createElement('button');
  exportDxf.type = 'button'; exportDxf.className = 'cad-btn cad-btn-secondary cad-python-action'; exportDxf.textContent = 'DXF'; exportDxf.dataset.onlineTitle = 'Exportar desenho em DXF';
  exportDxf.addEventListener('click', () => { window.location.href = `/desenho-tecnico/cad/${id}/dxf`; });

  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.dxf,application/dxf,text/plain'; input.hidden = true;
  input.addEventListener('change', () => importDxf(input));
  const importButton = document.createElement('button');
  importButton.type = 'button'; importButton.className = 'cad-btn cad-btn-secondary cad-python-action'; importButton.textContent = 'Importar DXF'; importButton.dataset.onlineTitle = 'Adicionar geometria de um arquivo DXF';
  importButton.addEventListener('click', () => input.click());

  actionsHost.prepend(input);
  actionsHost.prepend(importButton);
  actionsHost.prepend(exportDxf);
  actionsHost.prepend(analyze);
  actionsHost.prepend(badge);
  checkStatus(badge, [analyze, exportDxf, importButton]);
}

window.addEventListener('DOMContentLoaded', install);
