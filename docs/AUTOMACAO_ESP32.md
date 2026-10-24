# Automação — API de dispositivos ESP32 (modo SIMULAÇÃO)

Base: `https://manutencao.campodogado.app.br/api/automacao/device` (HTTPS iniciado pelo ESP32).
Auth: `Authorization: Bearer <token>`. O token é gerado em `/automacao/dispositivos` (ADMIN / supervisor),
mostrado uma vez; só o hash SHA-256 fica no banco. Gerar de novo substitui o token; "Revogar" o invalida.

- `POST /ping` — teste de comunicação, atualiza último contato.
- `POST /estado` — `{"fase":"INICIO|MEIO|FINAL","temperatura_c":95.2,"firmware":"0.1","uptime_s":120}`.
  INICIO = vermelho, MEIO = amarelo, FINAL = verde piscando (retornado em `sinaleiro`).
- Admin: `GET /automacao/api/dispositivos` (online = contato nos últimos 90 s).

Respostas sempre trazem `modo: SIMULACAO`, `comando_habilitado: false`, `comandos: []`. Não há rota de comando.
Digestores 2–4: gerar token para `ESP32-DIGESTOR-02..04`.
