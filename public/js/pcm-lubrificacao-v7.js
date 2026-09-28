(() => {
  const root = document.querySelector('[data-lub-monitor]');
  if (!root) return;

  const q = (sel) => root.querySelector(sel);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const stateLabel = (status) => status === 'CONCLUIDO' ? 'Concluído' : status === 'ANDAMENTO' ? 'Em andamento' : 'Pendente';

  function render(data) {
    const pct = Math.max(0, Math.min(100, Number(data.percentual || 0)));
    if (q('[data-lub-percent]')) q('[data-lub-percent]').textContent = pct + '%';
    if (q('[data-lub-done]')) q('[data-lub-done]').textContent = Number(data.pontos_concluidos || 0);
    if (q('[data-lub-pending]')) q('[data-lub-pending]').textContent = Number(data.pontos_pendentes || 0);
    if (q('[data-lub-events]')) q('[data-lub-events]').textContent = Number(data.execucoes_semana || 0);
    if (q('[data-lub-fill]')) q('[data-lub-fill]').style.width = pct + '%';
    if (q('[data-lub-walker]')) q('[data-lub-walker]').style.left = Math.max(2, Math.min(98, pct)) + '%';

    const status = q('[data-lub-status]');
    if (status) {
      status.textContent = pct >= 100 ? 'ROTEIRO CONCLUÍDO' : Number(data.pontos_concluidos || 0) > 0 ? 'EM ANDAMENTO' : 'NÃO INICIADO';
      status.classList.toggle('warn', pct < 100);
    }

    const last = data.ultima_atividade;
    if (q('[data-lub-current-eq]')) q('[data-lub-current-eq]').textContent = last?.equipamento_nome || 'Roteiro ainda não iniciado';
    if (q('[data-lub-current-location]')) q('[data-lub-current-location]').textContent = last
      ? [last.area_operacional_label, last.setor || 'Setor não informado'].filter(Boolean).join(' • ')
      : 'Aguardando primeira execução da semana';
    if (q('[data-lub-current-user]')) q('[data-lub-current-user]').textContent = last?.executor_nome || data.responsavel_nome || 'Responsável não definido';

    const areas = q('[data-lub-areas]');
    if (areas) {
      areas.innerHTML = (data.areas || []).map((area) => `
        <article class="lub-area-card">
          <span>${esc(area.label)}</span>
          <strong>${Number(area.percentual || 0)}%</strong>
          <div class="lub-mini-track"><i style="width:${Math.max(0,Math.min(100,Number(area.percentual||0)))}%"></i></div>
          <small>${Number(area.pontos_concluidos||0)}/${Number(area.total_pontos||0)} pontos • ${Number(area.equipamentos||0)} equipamento(s)</small>
        </article>
      `).join('') || '<div class="pcm-empty-row">Ainda não há pontos ativos e validados para acompanhar.</div>';
    }

    const body = q('[data-lub-equipment-body]');
    if (body) {
      body.innerHTML = (data.equipamentos || []).map((item) => `
        <tr class="lub-row-${String(item.status || 'PENDENTE').toLowerCase()}">
          <td><strong>${esc(item.area_operacional_label)}</strong><small>${esc(item.equipamento_nome)}</small></td>
          <td>${esc(item.setor || 'Não informado')}</td>
          <td>${Number(item.pontos_concluidos||0)}/${Number(item.total_pontos||0)}</td>
          <td><span class="lub-state ${String(item.status || 'PENDENTE').toLowerCase()}">${stateLabel(item.status)}</span><small>${Number(item.percentual||0)}%</small></td>
          <td>${esc(item.ultima_execucao || '-')}</td>
        </tr>
      `).join('');
    }
  }

  async function refresh() {
    try {
      const response = await fetch(root.dataset.url, { headers:{ Accept:'application/json' }, cache:'no-store' });
      if (!response.ok) return;
      render(await response.json());
    } catch (_error) {
      // Mantém o último estado renderizado pelo servidor.
    }
  }

  window.setInterval(refresh, 45000);
})();
