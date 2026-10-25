/* Leitura segura das APIs JSON da bancada: valida HTTP, redirecionamento e Content-Type antes do corpo. */
(function (root) {
  'use strict';
  class BancadaError extends Error {
    constructor(kind, message, status) { super(message); this.kind = kind; this.status = status || null; }
  }
  const MSG = {
    sessao: 'Sessão expirada — entre novamente no CAD',
    permissao: 'Sem permissão (requer ADMIN ou token CSRF válido)',
    resposta: 'Resposta inesperada do servidor (não é JSON)',
    rede: 'Falha de comunicação com o CAD',
  };
  async function fetchJson(url, options) {
    let r;
    try { r = await fetch(url, Object.assign({ credentials: 'same-origin', cache: 'no-store', redirect: 'manual' }, options, { headers: Object.assign({ Accept: 'application/json' }, options && options.headers) })); }
    catch (e) { throw new BancadaError('rede', MSG.rede + ': ' + e.message); }
    if (r.type === 'opaqueredirect' || (r.status >= 300 && r.status < 400) || r.redirected) throw new BancadaError('sessao', MSG.sessao, r.status);
    if (r.status === 401) throw new BancadaError('sessao', MSG.sessao, 401);
    if (r.status === 403) throw new BancadaError('permissao', MSG.permissao, 403);
    if (!r.ok) throw new BancadaError('servidor', 'Erro do servidor (HTTP ' + r.status + ')', r.status);
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) {
      if (/\/auth\/login/.test(r.url || '')) throw new BancadaError('sessao', MSG.sessao, r.status);
      throw new BancadaError('resposta', MSG.resposta, r.status);
    }
    let data;
    try { data = await r.json(); } catch { throw new BancadaError('resposta', MSG.resposta, r.status); }
    if (!data || typeof data !== 'object') throw new BancadaError('resposta', MSG.resposta, r.status);
    return data;
  }
  const api = { fetchJson, BancadaError };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CGDBancadaHttp = api;
})(typeof window !== 'undefined' ? window : globalThis);
