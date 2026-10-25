'use strict';

// Somente endereços LAN. Nunca fazemos fetch/redirect do servidor para a URL;
// ela é exibida como link HTTPS -> HTTP de navegação explícita do operador.
function normalizeLocalUrl(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const input = String(raw).trim();
  if (input.length > 160 || !/^https?:\/\//i.test(input)) throw new Error('Informe http://IP do ESP32 na rede local.');
  let u;
  try { u = new URL(input); } catch (_) { throw new Error('Endereço local inválido.'); }
  if (u.protocol !== 'http:' || u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) {
    throw new Error('Use apenas http://IP, sem senhas, caminhos ou parâmetros.');
  }
  const host = u.hostname.toLowerCase();
  const octets = host.split('.').map(Number);
  const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) &&
    octets.every((o) => Number.isInteger(o) && o >= 0 && o <= 255);
  const privateIpv4 = isIpv4 && (octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168));
  const localHostname = /^[a-z0-9][a-z0-9-]{0,62}\.local$/.test(host);
  if (!privateIpv4 && !localHostname) {
    throw new Error('Use IP privado (10.x, 172.16–31.x, 192.168.x) ou nome .local.');
  }
  return u.origin + '/';
}
module.exports = { normalizeLocalUrl };
