# Piloto de telemetria ESP32 — IHM dos Digestores

## Objetivo
Testar **somente** o LED de GPIO2 do **ESP32-D0WD-V3** no Digestor 1, via Wi-Fi → HTTPS → Railway → IHM.
Não existe leitura PT100 nem controle de relé, válvula, purgador ou contator nesta etapa.

## Endpoints
- `POST /automacao/api/esp32/telemetria` — recebe `{"device_id":"digestor-1","gpio2":true}`, exige header `Authorization: Bearer <token>`, sem sessão web.
- `GET /automacao/api/esp32/estado` — somente usuários logados com `automacao_view`, retorna conexão, último sinal e horário; nunca comandos.
- Página: `/automacao/digestores` — um bloco de teste do ESP32 ao lado da temperatura do Digestor 1.
- O servidor marca desconectado após 10 segundos sem pacotes.

## Instalação do teste
1. Preparar uma chave aleatória de pelo menos 32 caracteres no próprio computador com `python -c "import secrets;print(secrets.token_hex(32))"`. Guarde a chave fora de chats/GitHub.
2. Configurar a variável **IHM_ESP32_D1_TOKEN** no Railway, no serviço correto. O processo deve reiniciar/redeployar com a variável.
3. Abrir `examples/esp32/digestor1_wifi_telemetria.ino` no Arduino IDE, placa **ESP32 Dev Module**, porta correta; preencher **localmente** `WIFI_NOME`, `WIFI_SENHA`, `TOKEN_IHM` com a mesma chave do Railway.
4. O sketch valida HTTPS pela raiz Let's Encrypt ISRG Root X1. Confirme se a cadeia de certificados do domínio usa essa CA; se o domínio estiver atrás de proxy Cloudflare ou outro emissor, atualize a CA antes de conectar. **Não usar setInsecure()**.
5. Compilar, carregar e abrir o Monitor Serial a 115200 baud. Esperar `HTTP=200`.
6. Fazer login autorizado no CAD e abrir `/automacao/digestores`; o bloco do ESP32 D1 deve alternar ligado/desligado. A IHM consulta o estado a cada 800 ms.
7. Desligar o cabo USB ou Wi-Fi: após 10 segundos a tela deve mostrar sem comunicação. Ao restabelecer, ela deve voltar a conectar.

## Observações de segurança e limitações
- Nunca ligar 220 V nem outras cargas industriais aos GPIOs. Nesta prova usar apenas LED existente no GPIO 2 ou LED de baixa corrente com resistor.
- A chave é exclusiva para ingestão de **dados** do piloto, sem permissão para gerar comandos.
- O estado é **volátil e em memória**, pensado para 1 instância do servidor; após restart do Railway o estado volta a desconectado até a próxima mensagem. Não é histórico operacional nem deve ser usado para automação real.
- O campo `temperatura_c: null` é intencional, pois ainda não há PT100 MAX31865 conectado.
- **Não publicar** versões do sketch com senhas Wi-Fi ou token preenchidos.
