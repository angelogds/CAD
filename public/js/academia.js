function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatProfessorAnswer(text) {
  const raw = String(text || '').trim();
  if (!raw) return '<p>Sem resposta.</p>';

  const lines = raw.split(/\r?\n/);
  let html = '';
  let inList = false;

  lines.forEach((line) => {
    const clean = line.trim();
    if (!clean) {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      return;
    }

    const isBullet = /^[-*•]\s+/.test(clean) || /^\d+[\.)]\s+/.test(clean);
    if (isBullet) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${escapeHtml(clean.replace(/^([-*•]|\d+[\.)])\s+/, ''))}</li>`;
      return;
    }

    if (inList) {
      html += '</ul>';
      inList = false;
    }

    if (/^#{1,3}\s+/.test(clean)) {
      html += `<p><strong>${escapeHtml(clean.replace(/^#{1,3}\s+/, ''))}</strong></p>`;
      return;
    }

    html += `<p>${escapeHtml(clean)}</p>`;
  });

  if (inList) html += '</ul>';
  return html || `<p>${escapeHtml(raw)}</p>`;
}

function appendChatMessage(role, content, { isHtml = false } = {}) {
  const log = document.getElementById('iaChatLog');
  if (!log) return;

  const msg = document.createElement('div');
  msg.className = `ia-msg ${role === 'user' ? 'ia-msg-user' : 'ia-msg-assistant'}`;

  const roleEl = document.createElement('div');
  roleEl.className = 'ia-msg-role';
  roleEl.textContent = role === 'user' ? 'Você' : 'Professora IA';

  const bodyEl = document.createElement('div');
  bodyEl.className = 'ia-msg-body';
  if (isHtml) bodyEl.innerHTML = content;
  else bodyEl.textContent = content;

  msg.appendChild(roleEl);
  msg.appendChild(bodyEl);
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
}

async function callProfessorIA(action) {
  const warning = document.getElementById('iaWarning');
  const perguntaEl = document.getElementById('iaPergunta');
  const cursoEl = document.getElementById('iaCursoId');
  const modoEl = document.getElementById('iaModo');

  const pergunta = perguntaEl?.value?.trim() || '';
  const cursoId = cursoEl?.value || '';
  const modo = modoEl?.value || 'curso';

  if (!pergunta) {
    if (warning) warning.textContent = 'Digite uma pergunta para continuar.';
    return;
  }

  appendChatMessage('user', pergunta);
  appendChatMessage('assistant', 'Pensando na melhor explicação...');
  const loadingMsg = document.querySelector('#iaChatLog .ia-msg:last-child .ia-msg-body');
  if (warning) warning.textContent = '';

  try {
    const r = await fetch('/academia/professor-ia/perguntar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, pergunta, modo, curso_id: cursoId || null }),
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || 'Falha ao consultar IA');

    if (loadingMsg) {
      loadingMsg.innerHTML = formatProfessorAnswer(data?.resposta || 'Sem resposta.');
    }

    if (warning && data?.warning) warning.textContent = data.warning;
    if (perguntaEl) perguntaEl.value = '';
  } catch (err) {
    if (loadingMsg) loadingMsg.textContent = 'Não foi possível consultar o Professor IA agora. Tente novamente.';
    if (warning) warning.textContent = err.message;
  }
}

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-open-external]');
  if (trigger) {
    const url = trigger.getAttribute('data-open-external');
    if (url) window.open(url, '_blank', 'noopener');
    return;
  }

  const iaBtn = event.target.closest('[data-ia-action]');
  if (iaBtn) {
    const action = iaBtn.getAttribute('data-ia-action') || 'perguntar';
    callProfessorIA(action);
  }
});
