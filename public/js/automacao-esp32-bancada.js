(() => {
  'use strict';
  const root = document.getElementById('esp32-bancada-local');
  if (!root) return;
  const ip = root.querySelector('#esp32-ip-local');
  const link = root.querySelector('#esp32-abrir-ihm');
  const aviso = root.querySelector('#esp32-aviso-ip');
  const torre = root.querySelector('#esp32-torre-bancada');
  const etapa = root.querySelector('#esp32-etapa-bancada');
  let timeout = null;

  function ipPrivadoValido(value) {
    const partes = value.trim().split('.');
    if (partes.length !== 4 || partes.some(p => !/^(0|[1-9]\d{0,2})$/.test(p) || Number(p) > 255)) return false;
    const a = Number(partes[0]), b = Number(partes[1]);
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  function definirEndereco() {
    const host = ip.value.trim();
    if (!ipPrivadoValido(host)) {
      link.removeAttribute('href');
      aviso.textContent = 'Informe um IP privado válido do ESP32 (ex.: 192.168.18.31).';
      return;
    }
    link.href = 'http://' + host + '/';
    aviso.textContent = 'A IHM abre em outra aba. O computador precisa estar na mesma rede Wi-Fi do ESP32.';
    try { localStorage.setItem('cad_automacao_esp32_d1_ip', host); } catch (_) { /* armazenamento opcional */ }
  }
  try { ip.value = localStorage.getItem('cad_automacao_esp32_d1_ip') || '192.168.18.31'; }
  catch (_) { ip.value = '192.168.18.31'; }
  ip.addEventListener('input', definirEndereco);
  link.addEventListener('click', e => {
    if (!ipPrivadoValido(ip.value)) { e.preventDefault(); aviso.textContent = 'Corrija o endereço IP antes de abrir.'; }
  });
  definirEndereco();

  root.querySelectorAll('[data-esp32-etapa]').forEach(botao => {
    botao.addEventListener('click', () => {
      if (timeout) clearTimeout(timeout);
      const nome = botao.dataset.esp32Etapa;
      torre.dataset.cor = nome;
      etapa.textContent = nome === 'inicio' ? 'Início: vermelho' :
        nome === 'meio' ? 'Meio: amarelo' : 'Final: verde piscando';
      root.querySelectorAll('[data-esp32-etapa]').forEach(b => b.setAttribute('aria-pressed', String(b === botao)));
      timeout = setTimeout(() => {
        torre.dataset.cor = 'nenhuma';
        etapa.textContent = 'Simulação visual encerrada';
        root.querySelectorAll('[data-esp32-etapa]').forEach(b => b.setAttribute('aria-pressed', 'false'));
      }, 5000);
    });
  });
  root.querySelector('#esp32-parar-bancada').addEventListener('click', () => {
    if (timeout) clearTimeout(timeout);
    torre.dataset.cor = 'nenhuma';
    etapa.textContent = 'Parado';
    root.querySelectorAll('[data-esp32-etapa]').forEach(b => b.setAttribute('aria-pressed', 'false'));
  });
})();
