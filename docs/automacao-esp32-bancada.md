# ESP32 V5/V6 — sinaleiros de bancada (somente luzes, baixa tensão)

Base: `https://manutencao.campodogado.app.br` · Header `Authorization: Bearer <token do digestor>` · JSON.

## CAD -> ESP32 (consulta a cada 2-3 s)
`POST /api/automacao/device/sinaleiro-bancada` body `{"digestor_id":1}`
Resposta: `sinaleiro_bancada: {digestor_id, fase, versao_fase, validade_ms}`.
`versao_fase` é um contador que o CAD incrementa a cada publicação; o firmware `bancada-v6` deve ecoá-lo em `/estado`.
INICIO = vermelho · MEIO = amarelo · FINAL = verde piscando · PARADO = tudo apagado.

Regras de segurança do firmware:
1. Ao receber a fase, guardar `deadline = millis() + validade_ms` (não usar relógio do servidor).
2. Se `millis() >= deadline`, falha HTTP, 401/403/429/5xx, timeout ou perda de Wi-Fi: apagar as três saídas.
3. Nunca religar sem nova resposta válida. Validade máxima: 6500 ms.

## ESP32 -> CAD
`POST /api/automacao/device/ping` e `POST /api/automacao/device/estado`.

Firmware `bancada-v6` (exemplo; NÃO há `saida_confirmada` porque a lâmpada não tem feedback elétrico):
```json
{"device_id":"ESP32-DIGESTOR-01","digestor_id":1,
 "fase":"MEIO","fase_recebida":"MEIO","fase_aplicada":"MEIO","versao_fase":7,
 "origem":"SIMULACAO","firmware":"bancada-v6","uptime_s":123,"wifi_rssi":-60}
```
Firmware antigo (v5 ou piloto) continua aceito: só `fase` é obrigatória; sem `versao_fase` o CAD correlaciona por horário (relatório posterior à primeira entrega do comando).

- `fase` (obrigatória, compatível com o piloto): INICIO, MEIO, FINAL ou PARADO.
- `fase_recebida`: o que o ESP32 leu do CAD. Não prova que as saídas mudaram.
- `fase_aplicada`: o que o firmware comandou nos GPIOs. Ainda não é feedback elétrico.
- `versao_fase`: ecoar o valor recebido em `sinaleiro_bancada.versao_fase`. Relatório com versão diferente da atual não confirma o comando atual.
- `saida_confirmada`: enviar SOMENTE com leitura elétrica real da saída (exige `fase_aplicada`). **O firmware v6 deve omitir este campo.** Omitido = "não informada".
- `origem`: nesta fase de bancada todo dado é tratado como SIMULACAO; `REAL` é ignorado e nunca classificado como medição de processo.
- `wifi_rssi`, `uptime_s`, `firmware`: diagnóstico.
- PT100 (`temperatura_c`, `sensor_tipo`, `sensor_status`, `timestamp_medicao`): desativado; valores são descartados.

## Como o CAD interpreta (painel de supervisão)
1. Comunicação: ONLINE (contato ≤ 15 s), ATRASADA (≤ 90 s), OFFLINE (> 90 s), sem ESP32 registrado.
2. Fase recebida: confirmada só se o relatório é do comando atual e `fase_recebida` = fase solicitada.
3. Fase aplicada: confirmada só com `fase_aplicada` = fase solicitada; sem o campo fica "não informada"; sem relatório do comando atual, "pendente".
4. Saída física: confirmada somente com `saida_confirmada:true` real; caso contrário "não informada".
5. Comando vencido (6,5 s sem renovação) volta a PARADO; só um relatório posterior ao vencimento confirma PARADO.
6. Comunicação atrasada/offline: nenhuma confirmação é exibida.

## Teste físico
1. ADMIN: Automação > Configuração, gerar token do Digestor 1 e gravar no ESP32 (carga 220 V desconectada).
2. Simulador, selecionar Digestor 1, marcar "Sincronizar seleção com ESP32", Iniciar.
3. Conferir: vermelho -> amarelo -> verde piscando; a tabela mostra fase solicitada, recebida, aplicada (pendente/não informada até o firmware relatar), saída física (não informada no v6) e comunicação.
4. Pausar/Reiniciar: luzes apagam. Fechar a aba ou desligar o Wi-Fi: luzes apagam em até 6,5 s.
