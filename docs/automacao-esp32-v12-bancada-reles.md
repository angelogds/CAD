# ESP32 V12 revisão 2 — ensaio de relés e LEDs na bancada

Identificador desta revisão na IHM: `temperatura-v12-bancada-reles-leds-r2`. A atualização do site não grava o firmware na placa: carregar o novo `.ino` continua sendo uma etapa local da bancada.

Projeto Campo do Gado · 2A Automação Industrial. Esta versão destina-se **exclusivamente a relés que acendem lâmpadas de teste**, desacoplados de máquinas, cilindros, válvulas pneumáticas, vapor e circuitos de produção. **Não instalar no chão de fábrica.**

## Objetivo e comportamento

A simulação CAD gera etapas CARGA, COZIMENTO, DESCARGA e TRANSFERÊNCIA. Na IHM local do ESP32 os **purgadores de camisa/eixo** permanecem nos dois blocos originais e recebem uma indicação luminosa por canal. Logo abaixo, um bloco "Guilhotinas" mostra a posição virtual ABERTA/FECHADA e o tempo em cada estado.

Selecionar **Simulação CAD** na IHM e fechar a chave GPIO27→GND autoriza o espelhamento automático dos LEDs. Não existe segundo botão de armamento. Os sinaleiros GPIO18/19/21 seguem a temperatura simulada; GPIO25/26 seguem os purgadores/empurradores virtuais; os dois pares das guilhotinas mostram aberto/fechado. Aquecimento e motor continuam exclusivamente virtuais, sem saída de vapor ou partida de motor.

Nesta V12, **Manual, Automático, testes rápidos e PT100 são somente visualização**, com GPIOs desligados. Todos os nove relés exigem o modo Simulação CAD e os permissivos da bancada, incluindo os testes individuais de 2 segundos. Os firmwares legados V11 e `esp32-sinaleiros` não foram alterados.

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
| Habilitação física local | 27 → GND | Chave/jumper mantido durante o ensaio (entrada INPUT_PULLUP) |

As saídas são **ativas em LOW** conforme o módulo de relés do piloto; confirmar com multímetro **antes de conectar qualquer carga**. GPIOs do ESP32 são de 3,3 V: não ligar lâmpadas de 24 V nem bobinas diretamente aos pinos; utilizar interfaces de relés apropriadas e fonte externa corretamente protegida. Manter cargas e comandos industriais completamente desconectados nesta fase.

**Compatibilidade:** a pinagem acima destina-se ao ESP32 clássico com módulo **WROOM sem PSRAM**. No WROVER, GPIO16/17 são usados pela memória e não são alternativas livres para LEDs; consulte os [esquemas oficiais WROVER-E/IE](https://www.espressif.com/sites/default/files/documentation/esp32-wrover-e_esp32-wrover-ie_datasheet_en.pdf). O sketch bloqueia os indicadores antes de configurar os pinos quando `BOARD_HAS_PSRAM`, a placa WROVER Kit ou `psramFound()` indicarem PSRAM. Compilar como Dev Module com PSRAM desabilitada **não identifica automaticamente** um módulo WROVER montado: conferir a inscrição do módulo e a placa continua obrigatório. Também não usar UART2 em GPIO16/17 simultaneamente. Outro módulo/PSRAM exige remapeamento e validação elétrica; não foi inventada uma pinagem substituta.

## Habilitar o ensaio

1. Gravar o firmware `firmware/releases/CampoDoGado_ESP32_V12_Bancada_Reles.ino` na ESP32 Dev Module (core 3.3.12 / ArduinoJson 7.4.3).
2. Ligar **apenas interfaces de relés e LEDs de baixa tensão**; verificar saída desligada antes de conectar a carga. Usar fonte e resistores/limitadores compatíveis.
3. Ligar o ESP32 ao Wi-Fi 2,4 GHz e à integração CAD como na V11.
4. Selecionar **Simulação CAD** na IHM local `http://192.168.4.1`. No CAD, ativar o circuito integrado e iniciar.
5. Conferir a atualização do pacote CAD em `/api/estado`. A aba precisa mostrar `simulacao_cad_atual: true`.
6. Fechar a chave GPIO27→GND. Com pacote completo e atual, a IHM informa **ESPELHAMENTO CAD ATIVO** e os LEDs acompanham o processo automaticamente.
7. Observar os dois purgadores nos blocos existentes e as guilhotinas no único bloco compacto logo abaixo. A posição e o tempo são simulados; os LEDs representam comandos de GPIO.
8. Para encerrar, clicar **Desarmar e apagar todos**: o ESP32 entra em PARADO, apaga todos os LEDs, cancela temporizadores e impede retomada automática. Para retomar, selecionar novamente **Simulação CAD**. Abrir a chave também corta o espelhamento.

## Testes individuais isolados

Com Simulação CAD selecionada, comunicação atual e chave ativa, usar **Testar LED** junto ao purgador, **Testar aberta/fechada** junto à guilhotina ou os três botões de teste individual dos sinaleiros no bloco de bancada. A requisição local `/api/bancada/teste` aceita exatamente nove canais nomeados: `vermelho`, `amarelo`, `verde`, `camisa`, `eixo`, `carga_aberta`, `carga_fechada`, `descarga_aberta`, `descarga_fechada`.

Cada teste apaga os demais oito LEDs e energiza somente o canal selecionado por **até 2 segundos**, controlados pela tarefa local da ESP32. Requisições sobrepostas são recusadas; existe intervalo mínimo de 1 segundo após o término. Perder comunicação, chave ou validade interrompe o teste. A expiração mantém tudo desarmado: selecionar novamente Simulação CAD para voltar ao ciclo. O botão de desarme funciona durante o teste. Nenhum comando de teste contém saída industrial, posição mecânica confirmada ou duração livre enviada pelo navegador.

## Condições de bloqueio e segurança

- Sem autorização local, nenhum canal de LED de atuador é energizado, mesmo que o CAD esteja funcionando.
- A seleção é **volátil**: reiniciar sempre deixa o modo PARADO e todas as saídas apagadas. Wi-Fi e token salvos permanecem disponíveis.
- O pacote CAD deve identificar SIMULACAO, bancada e processo desabilitado, digestor correto, temperatura/faixa/cor/pronto coerentes e estados completos de purgadores/guilhotinas. A validade máxima é **6.500 ms**; cada pacote tem seu próprio vencimento. Estados ausentes ou guilhotinas simultaneamente abertas não liberam o espelhamento.
- Troca de modo, perda do Wi-Fi, pacote inválido/vencido, remoção da chave e atraso da tarefa local acima de 2 segundos desligam os LEDs. Pacotes novos e reconexão sozinhos **não rearmam** após falha: selecionar novamente Simulação CAD ou deliberadamente abrir e fechar a chave. Após desarme manual ou teste individual, somente nova seleção de Simulação CAD retoma o ciclo.
- O núcleo e o driver aplicam intertravamento entre aberta/fechada de cada guilhotina e entre abertura de carga/descarga. O núcleo também rejeita ambos os purgadores abertos ou várias cores de sinaleiro simultaneamente. A troca dos LEDs do par desliga primeiro os pinos anteriores.
- As indicações `ABERTA` e `FECHADA` vêm do CAD: **não constituem retorno físico de fim de curso**.
- A rota de pulso local de guilhotinas e as rotas reais de purgadores permanecem inoperantes na V12. Somente o modo LED de bancada permite saídas.
- A V11 permanece como referência de simulação visual; **não fazer upgrade automático da V12 para operação real**. Exigirá projeto próprio, intertravamentos físicos, análise de risco, teste de campo e validação pelos responsáveis.

## Verificação sem inventar testes

A integração de software é verificada pela action `.github/workflows/esp32-v12-bancada-reles.yml` (Arduino CLI) e pelos testes abaixo. O teste C++ extrai e compila o próprio núcleo portátil embutido no sketch entregue: partida desligada, seleção CAD, estados dos nove LEDs, validade, perda de Wi-Fi/chave, latch após falha, ausência de rearme após desarme, intertravamentos, isolamento/expiração dos nove testes e rollover de `millis()`.

```sh
node --test tests/automacao-esp32-v12-bancada-reles.test.js tests/esp32-v12-bench-state.test.js
arduino-cli compile --fqbn esp32:esp32:esp32 --warnings all CampoDoGado_ESP32_V12_Bancada_Reles
```

Para Arduino CLI/IDE, copiar o `.ino` único para uma pasta de mesmo nome, instalar ESP32 core 3.3.12 e ArduinoJson 7.4.3. Não exige os headers do firmware legado. A compilação e os testes de software **não confirmam montagem elétrica**, polaridade real do módulo, resposta das lâmpadas ou compatibilidade da placa física. Não houve gravação/intervenção no equipamento nem teste de hardware concluído. O responsável pela bancada deve registrar os resultados físicos.
