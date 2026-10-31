# ESP32 V12 — ensaio de relés e LEDs na bancada

Projeto Campo do Gado · 2A Automação Industrial. Esta versão destina-se **exclusivamente a relés que acendem lâmpadas de teste**, desacoplados de máquinas, cilindros, válvulas pneumáticas, vapor e circuitos de produção. **Não instalar no chão de fábrica.**

## Objetivo e comportamento

A simulação CAD gera etapas CARGA, COZIMENTO, DESCARGA e TRANSFERÊNCIA. Na IHM local do ESP32 os **purgadores de camisa/eixo** permanecem nos dois blocos originais e recebem uma indicação luminosa por canal. Logo abaixo, um bloco "Guilhotinas" mostra a posição virtual ABERTA/FECHADA e o tempo em cada estado.

O ESP32 segue esses estados, energizando os relés ligados aos LEDs **somente depois de autorizar a bancada localmente**. Os sinaleiros tricolores GPIO18, 19 e 21 seguem a temperatura simulada.

## Pinagem para painel EXCLUSIVO de LEDs

| Indicação na bancada | GPIO ESP32 | Comportamento |
|---|---:|---|
| Sinaleiro vermelho | 18 | Simulação térmica |
| Sinaleiro amarelo | 19 | Simulação térmica |
| Sinaleiro verde | 21 | Simulação térmica |
| Purgador/empurrador camisa | 25 | Alterna com o estado virtual CAD |
| Purgador/empurrador eixo | 26 | Alterna com o estado virtual CAD |
| Guilhotina carga ABERTA | 32 | Aceso se CAD simula aberta |
| Guilhotina carga FECHADA | 33 | Aceso se CAD simula fechada |
| Guilhotina descarga ABERTA | 16 | Aceso se CAD simula aberta |
| Guilhotina descarga FECHADA | 17 | Aceso se CAD simula fechada |
| Habilitação física local | 27 → GND | Chave/jumper momentâneo de autorização (entrada INPUT_PULLUP) |

As saídas são **ativas em LOW** conforme o módulo de relés do piloto; confirmar com multímetro **antes de conectar qualquer carga**. GPIOs do ESP32 são de 3,3 V: não ligar lâmpadas de 24 V nem bobinas diretamente aos pinos; utilizar interfaces de relés apropriadas e fonte externa corretamente protegida. Manter cargas e comandos industriais completamente desconectados nesta fase.

## Habilitar o ensaio

1. Gravar o firmware `firmware/releases/CampoDoGado_ESP32_V12_Bancada_Reles.ino` na ESP32 Dev Module (core 3.3.12 / ArduinoJson 7.4.3).
2. Ligar **apenas interfaces de relés e LEDs de baixa tensão**; verificar saída desligada antes de conectar a carga. Usar fonte e resistores/limitadores compatíveis.
3. Ligar o ESP32 ao Wi-Fi 2,4 GHz e à integração CAD como na V11.
4. Selecionar **Simulação CAD** na IHM local `http://192.168.4.1`. No CAD, ativar o circuito integrado e iniciar.
5. Conferir a atualização do pacote CAD em `/api/estado`. A aba precisa mostrar `simulacao_cad_atual: true`.
6. Fechar a chave local GPIO27→GND e clicar **Armar relés LEDs da bancada** no bloco dos purgadores.
7. Observar LEDs e guilhotinas na IHM. Para terminar, clicar **Desarmar e apagar todos** ou abrir a chave local. A chave também deve estar aberta antes de desconectar/alimentar outras cargas.

## Condições de bloqueio e segurança

- Sem autorização local, nenhum canal de LED de atuador é energizado, mesmo que o CAD esteja funcionando.
- A autorização é **volátil**, não é restaurada por reinício e expira em **10 minutos**.
- Troca de modo, perda do Wi-Fi, ausência de pacote CAD válido (> 6,5 s), remoção da chave e falha de sincronização desligam os relés e exigem novo armamento.
- As indicações `ABERTA` e `FECHADA` vêm do CAD: **não constituem retorno físico de fim de curso**.
- A rota de pulso local de guilhotinas e as rotas reais de purgadores permanecem inoperantes na V12. Somente o modo LED de bancada permite saídas.
- A V11 permanece como referência de simulação visual; **não fazer upgrade automático da V12 para operação real**. Exigirá projeto próprio, intertravamentos físicos, análise de risco, teste de campo e validação pelos responsáveis.

## Verificação sem inventar testes

A integração de software é verificada pelas actions `.github/workflows/esp32-v12-bancada-reles.yml` (Arduino CLI) e `tests/automacao-esp32-v12-bancada-reles.test.js` (Node). A compilação e os testes de software **não confirmam a montagem elétrica**, polaridade real do módulo ou resposta das lâmpadas. O responsável pela bancada deve registrar resultados reais antes de declarar o teste de hardware concluído.
