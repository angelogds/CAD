# Automação IHM · Digestores · revisão V7 (25/10/2026)

## Diagnóstico verificado em `main`
- `views/automacao/simulador-digestores.ejs` exibia **SIMULAÇÃO • SEM HARDWARE** como texto fixo.
- `public/js/automacao-simulador-core.js` já implementa faixas simuladas: **T < 80 °C vermelho; 80 ≤ T < 120 °C amarelo; T ≥ 120 °C verde**. Não são limites de segurança nem temperaturas reais.
- `public/js/automacao-simulador-remoto.js` envia fases CAD `INICIO/MEIO/FINAL` à API e acompanha resposta/telemetria. É canal **apenas dos relés de baixa tensão da bancada**.
- `sinaleiro-bancada.service.js` expira cada comando após no máximo 6500 ms. **Isto não equivale a tempo máximo de conexão ou permanência no modo.**
- `bancada-telemetria.service.js` mantém PT100 **desativado** e nunca registra `temperatura_c` como real.

## CAD neste PR
1. Badge de simulação atualizado dinamicamente pela telemetria da API: dispositivo online, comunicação atrasada, offline, não cadastrado ou erro; nunca presumir presença de hardware.
2. Configuração de cada ESP32 contém **URL privada da IHM local**, salva no CAD por ADMIN + CSRF; o link é aberto somente no navegador do operador.
3. Só é aceito `http://` em IPv4 RFC1918 ou host `.local`. Nada de credenciais, parâmetros, caminhos ou chamadas do servidor para o endereço; não abrir túnel nem proxy.
4. A API segue respondendo com os campos e as autorizações atuais. Não altera /ping, /estado, nem o TTL da bancada.

## Sketch V7 (entregue como arquivo .ino separado)
**Base:** firmware V6.1 do piloto do Digestor 1. Não substituir em produção sem compilar e testar em bancada.

- GPIO18/K1 vermelho, GPIO19/K2 amarelo, GPIO21/K3 verde, módulo ativo em LOW; não altera a pinagem.
- Quatro escolhas **locais**: PARADO, MANUAL, SIMULAÇÃO CAD e AUTOMÁTICO (apenas teste, 5s cada cor, encerra após 15s). O teste rápido de uma cor permanece separado e dura 5s.
- Ao selecionar **SIMULAÇÃO CAD**, salvar a seleção na NVS. Recarregar a página, cair/reconectar Wi-Fi ou passar 10 minutos não muda o modo. Na reinicialização, restaurar a seleção com todas as saídas desligadas até novo sinal CAD autenticado.
- O ESP32 consulta `POST /api/automacao/device/sinaleiro-bancada` continuamente com seu Bearer do digestor. Cada nova fase é mostrada em um **único** relé ligado; inclusive a luz verde fica fixa. A fase só troca quando o CAD envia outra fase.
- Preservar **TTL por comando** no máximo 6500 ms: vencimento, erro de rede/autenticação, token inválido ou Wi-Fi ausente => **TODAS as saídas DESLIGADAS**. O modo permanece SIMULAÇÃO e volta a mostrar comandos novos e válidos após reconexão.
- Telemetria continua diferenciando fase solicitada, recebida e aplicada; não inferir feedback elétrico. `temperatura_c:null`, `sensor_status:SEM_SENSOR` até validação dos sensores.
- Página local inclui torre tricolor, desenho simplificado do Digestor 1, seleção de modo, rede Wi-Fi e token CAD. A API local usa HTTP **sem autenticação**: proibido usá-la para operação industrial.

## Próxima fase: operação real (ainda NÃO implementada)
Um ESP32 individual por digestor; PT100/MAX31865 de 3 ou 4 fios a validar (pinagem SPI pode conflitar com GPIO18/19 da torre); faixa e calibração reais, RTC, diagnóstico de sensor aberto/curto, telemetria com origem **REAL**, critérios de qualidade e atualizações sem falsos dados.
Operação real é **ESP32 → CAD** e precisa de validação separada: alarmes, falha de comunicação e segurança independentes do CAD. Não habilitar o fluxo REAL apenas mudando o rótulo.

## Purgadores / contatores auxiliares: fase futura
São dois acionamentos propostos de 220 V, **não ligados por este PR ou firmware**. Necessários projeto elétrico, relés/contatores com capacidade adequada, proteção, intertravamento físico e lógico, avaliação de falha, teste de parada e liberação de engenharia.
Depois de ensaio seguro, fazer configuração local `tempo_camisa_s`, `tempo_eixo_s` e tempo morto (ambas saídas desligadas), com faixa validada, persistência NVS e confirmação. Nenhuma saída deve ligar simultaneamente os dois contatores. Não reutilizar o TTL da torre para comandar vapor.

## Testes de aceite
1. ADMIN com sessão válida acessa CAD → Configuração → cada dispositivo D1...D4, salva IP LAN e abre a IHM no navegador da rede local. URL pública ou maliciosa é rejeitada.
2. CAD simulador com ESP32 conectado apresenta **ONLINE** em vez do texto fixo 'sem hardware'. Sem ESP32/sem sessão: offline ou status indisponível, nunca ONLINE falso.
3. No ESP32 em SIMULAÇÃO CAD, CAD envia INICIO por > 10 min com renovações: luz vermelha fica acesa sem piscar; amarelo só na fase MEIO; verde fixo só na FINAL.
4. Recarregar página local não troca modo; reset do ESP32 mantém o modo escolhido mas inicia saídas OFF até sinal novo.
5. Interromper Wi-Fi/CAD, deixar expirar o TTL: saídas desligam em até 6,5 s, modo permanece SIMULAÇÃO; reconectar com comando válido atualiza fase.
6. Manual funciona para um canal por vez; AUTOMÁTICO testa cada cor em 5 s e desliga após o verde; modo PARADO desliga todos.
7. Nenhum cabo de 220 V, válvula, purgador ou contator de processo pode estar conectado durante estes testes.
8. Reexecutar testes existentes do CAD, lint, teste de API ADMIN/CSRF e compilação Arduino ESP32 Dev Module (hardware físico não disponível ao CI).
