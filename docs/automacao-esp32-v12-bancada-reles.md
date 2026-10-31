# ESP32 V12 revisão 3 — relés de bancada e guilhotinas em GPIO32/33

Identificador na IHM: `temperatura-v12-bancada-reles-leds-r3`.
Arquivo único: `firmware/releases/CampoDoGado_ESP32_V12_Bancada_Reles.ino`.
A atualização do site não grava a placa: carregar este `.ino` na Arduino IDE continua sendo uma etapa local.

Uso exclusivo em bancada com relés e LEDs, sem máquinas, solenóides ou cilindros conectados. A indicação ABERTA/FECHADA é simulada, sem retorno de fim de curso.

## O que muda em relação à r2

- Sete saídas disponíveis para testes físicos de LEDs. Nenhum GPIO é energizado automaticamente na partida.
- GPIO27→GND passa a ser opcional. A compilação padrão usa `CGD_BENCH_REQUIRE_LOCAL_KEY 0`; usar `1` exige novamente a chave. A IHM distingue presença do jumper de autorização. GPIO27 permanece entrada, nunca saída.
- Cada guilhotina usa **um único GPIO e um relé com contatos COM/NA/NF**: GPIO32 para alimentação e GPIO33 para descarga. Ativar o GPIO energiza a bobina e comuta o contato; desativar retorna ao contato normalmente fechado. Não existe GPIO separado para fechamento.
- GPIO16/17 não são configurados nem acionados. Foi retirado o bloqueio de PSRAM associado à antiga pinagem. Esta versão continua direcionada ao ESP32 clássico; conferir a disponibilidade de GPIO32/33 no módulo físico.
- Testes individuais dos sete canais funcionam mesmo sem token, conexão ao CAD ou ciclo ativo, pela IHM local/AP. São comandos locais temporizados, independentes da comunicação com o CAD.
- Manual, Automático e testes rápidos voltam a acionar os relés dos sinaleiros. Manual e teste rápido expiram em 5 s; Automático percorre quatro fases de 5 s e encerra. Purgadores e guilhotinas ficam desligados nesses modos.
- No modo Simulação CAD, os sete canais acompanham o pacote completo e atual recebido do sistema 2A. Sem comunicação ou com falha, não há espelhamento.
- As trocas de guilhotina desligam o canal anterior antes do próximo; um relé mantido ligado não recebe pulsos de desligamento a cada atualização.

## Pinagem

| Canal | GPIO | Relé/indicação |
|---|---:|---|
| Sinaleiro vermelho | 18 | Temperatura/faixa simulada |
| Sinaleiro amarelo | 19 | Temperatura/faixa simulada |
| Sinaleiro verde | 21 | Temperatura/faixa simulada |
| Purgador camisa | 25 | Aberto no CAD = energizado |
| Purgador eixo | 26 | Aberto no CAD = energizado |
| Guilhotina de alimentação | 32 | Energizado = abertura; desligado = retorno ao NF |
| Guilhotina de descarga | 33 | Energizado = abertura; desligado = retorno ao NF |
| Chave opcional | 27→GND | Entrada INPUT_PULLUP; dispensada na compilação padrão |

Saídas **ativas em LOW**: LOW energiza o relé, HIGH desenergiza. COM/NA/NF são contatos do relé; o GPIO comanda apenas sua interface de entrada. GPIO é 3,3 V: não ligar bobina ou lâmpada diretamente ao ESP32. Usar interface compatível e fonte adequada. O retorno do relé ao NF não comprova posição nem fechamento de uma guilhotina real.

## Gravar e testar

1. Na Arduino IDE, instalar **ESP32 core 3.3.12** e **ArduinoJson 7.4.3**. Selecionar ESP32 Dev Module para o módulo clássico utilizado na bancada.
2. Abrir o `.ino` em pasta com o mesmo nome e gravar. Preservar a configuração elétrica LOW do módulo existente. Confirmar `...-r3` no rodapé da IHM após atualizar a página.
3. Entrar na IHM pelo IP local ou pelo AP `192.168.4.1`. Não é necessário jumper GPIO27 nesta compilação.
4. Sem iniciar o CAD, usar **Testar LED · 2 s** em cada um dos sete canais. Cada teste desliga os demais, expira automaticamente e deixa a bancada parada. Aguardar 1 s entre testes. Nas guilhotinas, **Fechar e parar bancada** desenergiza todas as saídas.
5. Para sinaleiros, selecionar **Manual · LEDs** e uma cor, ou usar os testes rápidos de 5 s / Automático. A IHM exibe o comando elétrico aplicado.
6. Para o ciclo completo, configurar Wi-Fi 2,4 GHz e token CAD; selecionar **Simulação CAD** na IHM. No CAD 2A, selecionar digestor, manter sincronização ativa e iniciar o circuito integrado.
7. Confirmar **ESPELHAMENTO CAD ATIVO**: sinaleiros seguem a temperatura; GPIO25/26 alternam durante cozimento; GPIO32 acompanha abertura de alimentação e GPIO33 abertura da descarga. As duas saídas das guilhotinas ficam desligadas quando ambas estão fechadas.
8. **Desarmar e apagar todos / Parar tudo** cancela testes e apaga as saídas. Selecionar novamente Simulação CAD para retomar. Nenhum pacote remoto sozinho desfaz esse desarme.

## Intertravamentos e expiração

O núcleo rejeita alimentação e descarga simultaneamente abertas, ambos os purgadores abertos e várias cores do sinaleiro juntas. A partida é PARADO. Sem pacote CAD completo, digestor correto, modo SIMULACAO, campos coerentes e validade máxima de 6.500 ms, não há espelhamento. Perda do Wi-Fi/pacote ou atraso da tarefa acima de 2 s apaga as saídas e exige nova seleção local. Na compilação opcional com chave obrigatória, abrir GPIO27 também interrompe as saídas.

A requisição `/api/bancada/teste` aceita sete nomes: `vermelho`, `amarelo`, `verde`, `camisa`, `eixo`, `carga_aberta`, `descarga_aberta`. Nomes antigos `carga_fechada`/`descarga_fechada` são recusados: fechar significa desenergizar. Cada teste local dura até 2 s, com os outros seis canais apagados; não depende da rede CAD e não retoma o ciclo ao terminar. Sobreposição é recusada; perda da autorização opcional, falha ou tarefa atrasada interrompe o teste.

Temporizadores locais de purga continuam somente virtuais. Aquecimento, motor e rotas industriais não são liberados. Firmwares V11 e `esp32-sinaleiros` não foram alterados; este arquivo não é uma atualização para automação real de descarga.

## Verificação

```sh
node --test tests/automacao-esp32-v12-bancada-reles.test.js tests/esp32-v12-bench-state.test.js tests/esp32-v12-ihm-reles.test.js
arduino-cli compile --fqbn esp32:esp32:esp32 --warnings all CampoDoGado_ESP32_V12_Bancada_Reles
```

O teste C++ extrai o núcleo e os drivers do próprio `.ino` e os executa com a chave opcional e obrigatória. Verifica sete canais isolados, testes locais sem CAD, expiração, falhas de rede, parada sem rearme, rollover, intertravamento e ausência de escritas em GPIO16/17. A IHM é exercitada com estados disponíveis, teste ativo, perda de contato e bloqueio de placa.

Compilação e testes de software não confirmam montagem, polaridade física ou resposta das lâmpadas. A gravação e o teste de hardware continuam a cargo do responsável pela bancada; não foram executados pelo agente.
