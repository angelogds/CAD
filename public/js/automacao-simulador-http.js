/* Cliente JSON estrito da bancada: valida HTTP, redirecionamento e Content-Type antes de ler o corpo. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CGDSimHttp = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MSG = {
    SESSAO_EXPIRADA: 'Sessão expirada — entre novamente no CAD',
    SEM_PERMISSAO: 'Sem permissão de ADMIN para a bancada',
    CSRF_INVALIDO: 'Sessão de configuração alterada — recarregue a página',
    SERVIDOR: 'Erro do servidor',
    RESPOSTA_INVALIDA: 'Resposta inesperada do servidor',
    REDE: 'Sem comunicação com o CAD',
  };
  function fail(kind, detail) {
    const e = new Error(detail ? MSG[kind] + ' (' + detail + ')' : MSG[kind]);
    e.kind = kind;
    return e;
  }
  const isJson = (r) => /(^|[/+])json\b/i.test((r.headers && r.headers.get('content-type')) || '');
  async function fetchJson(url, options, fetchImpl) {
    let r;
    try { r = await (fetchImpl || fetch)(url, { credentials: 'same-origin', cache: 'no-store', redirect: 'manual', ...options }); }
    catch (_e) { throw fail('REDE'); }
    // redirect:'manual' devolve opaqueredirect (status 0); redirecionamento a /auth/login = sessão expirada.
    if (r.type === 'opaqueredirect' || r.redirected || (r.status >= 300 && r.status < 400)) throw fail('SESSAO_EXPIRADA');
    if (r.status === 401) throw fail('SESSAO_EXPIRADA');
    if (r.status === 403) {
      let code = '';
      try { if (isJson(r)) code = (await r.json()).code || ''; } catch (_e) { /* ignora */ }
      if (code === 'CSRF_INVALIDO') throw fail('CSRF_INVALIDO');
      throw fail('SEM_PERMISSAO', code === 'SEM_PERMISSAO' ? '' : 'HTTP 403');
    }
    if (!r.ok) throw fail('SERVIDOR', 'HTTP ' + r.status);
    if (!isJson(r)) throw fail('RESPOSTA_INVALIDA', 'não é JSON');
    let data;
    try { data = await r.json(); } catch (_e) { throw fail('RESPOSTA_INVALIDA', 'JSON inválido'); }
    if (!data || typeof data !== 'object' || data.ok === false) throw fail('SERVIDOR', (data && data.error) || 'rejeitado');
    return data;
  }
  return { fetchJson, MSG };
});
