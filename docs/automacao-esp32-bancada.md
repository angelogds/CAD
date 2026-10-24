# ESP32 V5 — sinaleiros de bancada (somente luzes, baixa tensão)

Base: `https://manutencao.campodogado.app.br` · Header `Authorization: Bearer <token do digestor>` · JSON.

## CAD -> ESP32 (consulta a cada 2-3 s)
`POST /api/automacao/device/sinaleiro-bancada` body `{"digestor_id":1}`
Resposta: `sinaleiro_bancada: {digestor_id, fase, validade_ms}`.
INICIO = vermelho · MEIO = amarelo · FINAL = verde piscando · PARADO = tudo apagado.

Regras de segurança do firmware:
1. Ao receber a fase, guardar `deadline = millis() + validade_ms` (não usar relógio do servidor).
2. Se `millis() >= deadline`, falha HTTP, 401/403/429/5xx, timeout ou perda de Wi-Fi: apagar as três saídas.
3. Nunca religar sem nova resposta válida. Validade máxima: 6500 ms.

## ESP32 -> CAD
`POST /api/automacao/device/ping` e `POST /api/automacao/device/estado`:
```json
{"device_id":"ESP32-DIGESTOR-01","digestor_id":1,
 "fase":"MEIO","fase_recebida":"MEIO","fase_aplicada":"MEIO",
 "saida_confirmada":true,"origem":"SIMULACAO","firmware":"v5","uptime_s":123,"wifi_rssi":-60}
```
- `fase` (obrigatória, compatível com o piloto): INICIO, MEIO, FINAL ou PARADO.
- `fase_recebida`: o que o ESP32 leu do CAD. `fase_aplicada`: o que o firmware ligou nas saídas.
- `saida_confirmada`: enviar SOMENTE se houver leitura/feedback real da saída; exige `fase_aplicada`. Omitir = "não informada".
- `origem`: SIMULACAO (padrão) ou REAL.
- PT100 (`temperatura_c`, `sensor_tipo`, `sensor_status`, `timestamp_medicao`): desativado; valores são descartados.

## Teste físico
1. ADMIN: Automação > Configuração, gerar token do Digestor 1 e gravar no ESP32 (carga 220 V desconectada).
2. Simulador, selecionar Digestor 1, marcar "Sincronizar seleção com ESP32", Iniciar.
3. Conferir: vermelho -> amarelo -> verde piscando; a tabela mostra fase enviada, recebida, aplicada e ESP32 Online.
4. Pausar/Reiniciar: luzes apagam. Fechar a aba ou desligar o Wi-Fi: luzes apagam em até 6,5 s.
