# ESP32 V12 revisão 5 — integração de componentes isolados em casa

Identificador na IHM: `temperatura-v12-componentes-isolados-r5`.
Arquivo único: `firmware/releases/CampoDoGado_ESP32_V12_Bancada_Reles.ino`.
A atualização do site não grava a placa: carregar este `.ino` na Arduino IDE continua sendo uma etapa local.

Escopo confirmado pelo responsável em 01/11/2026: montagem em casa, antes da implantação, com sinaleiros e válvulas normalmente fechadas de **220 Vca**; válvulas fora das máquinas, sem digestores, vapor, cilindros ou mecanismos conectados. As válvulas fecham sem energia e abrem quando energizadas, conforme informado pelo responsável. Isso é uma declaração do comportamento esperado, sem ensaio físico pelo agente.

Não há PT100, pressão, fins de curso ou emergência informados nesta montagem. O teste com componentes isolados não constitui operação de um digestor real; a indicação ABERTA/FECHADA continua sendo comando/simulação, sem retorno físico.

## Botão S · Simulação real

O botão fica ao lado de **Conectar ESP32**. Iniciar a animação sozinho mantém o modo visual. **Conectar ESP32** consulta o status. **S · Simulação real** vincula os sete relés ao ciclo, com ação explícita; é possível preparar o teste antes de clicar **Iniciar**. A opção avançada de vincular ao iniciar começa desmarcada. A seleção não é restaurada ao recarregar a página.

A ativação exige ESP32 online no digestor selecionado e não aceita ESP32 em operação REAL de supervisão. Na IHM do ESP32, selecionar **Simulação CAD**. As saídas ativas em LOW comutam os contatos dos relés; a bobina de 220 Vca pertence ao circuito de potência separado, nunca ao GPIO. A interface e o circuito de potência devem ser adequados à carga e verificados por profissional qualificado.

Todos os canais ficam disponíveis, mas seguem as etapas: uma cor por vez, purgadores alternados, alimentação e descarga sem abertura simultânea. Clicar novamente em **S · Encerrar teste real**, pausar, reiniciar ou mudar o digestor envia PARADO. Perda de comunicação/status interrompe o vínculo; a expiração local continua em até 6,5 s e a reconexão não rearma sozinha. Após desarme recebido na placa, selecionar novamente Simulação CAD localmente.

O perfil de resposta é `COMPONENTES_ISOLADOS`, com `processo_habilitado:false`. A IHM deixa de afirmar `somente_lampadas:true`: os relés podem comandar os componentes isolados. As rotas industriais continuam bloqueadas; o novo botão não habilita operação em máquina.

## Correção de atraso na r4

Na amostra de produção analisada, o processamento do servidor teve mediana de 22 ms na consulta dos comandos e 21 ms na telemetria, enquanto as consultas da ESP32 chegaram com mediana de 1.895 ms e máximo de 2.846 ms. Isso não mede o tempo físico do relé: evidencia a espera entre consultas e os custos de rede. A r3 mantinha a rotina HTTPS anterior: TLS novo a cada chamada, consulta a cada 1 s e envio de status separado ocupando a mesma tarefa.

A r4 mantém o cliente TLS/HTTP entre requisições e consome o corpo da resposta antes de reutilizar o socket. Erros fecham a conexão para permitir reconexão; a validação do certificado CA permanece. O handshake TLS recebe limite explícito de 3 s (o padrão do core era 120 s), e corpos HTTP incompletos descartam a conexão antes de reutilizá-la. O período mínimo de consulta passa a 250 ms, sujeito ao tempo de rede; Wi-Fi power-save é desativado na bancada. A IHM local consulta o estado a cada 250 ms, e o CAD consulta o status a cada 1 s sem repetir GETs a cada quadro da simulação.

A rota existente de consulta aceita um campo opcional `estado`, usando a mesma autenticação e validação de `/estado`. Confirma `estado_recebido: true` somente após salvar o relatório do mesmo digestor. O ESP32 envia o relatório nessa viagem a cada 2 s ou em mudança de modo/cor/versão; não precisa fazer um segundo POST para isso. Clientes antigos continuam válidos. Na ausência de ACK de servidor anterior, a r4 usa `/estado` como fallback.

O tempo gasto pela requisição é descontado da validade recebida, sem prolongar comandos atrasados. A revisão preserva a expiração dos testes individuais em 2 s, o desarme e os intertravamentos. Em **Integração com o CAD**, a IHM passa a mostrar **Tempo HTTPS** e **Intervalo das consultas**, medidos na própria placa, para comparar a rede após a gravação. Não se garante latência física de 250 ms nem operação em tempo real pela internet.

## Pinagem e liberação mantidas da r3

- Sete saídas disponíveis para testes dos relés com componentes isolados. Nenhum GPIO é energizado automaticamente na partida.
- GPIO27→GND passa a ser opcional. A compilação padrão usa `CGD_BENCH_REQUIRE_LOCAL_KEY 0`; usar `1` exige novamente a chave. A IHM distingue presença do jumper de autorização. GPIO27 permanece entrada, nunca saída.
- Cada guilhotina usa **um único GPIO e um relé com contatos COM/NA/NF**: GPIO32 para alimentação e GPIO33 para descarga. Ativar o GPIO energiza a bobina e comuta o contato; desativar retorna ao contato normalmente fechado. Não existe GPIO separado para fechamento; o estado de comando não confirma a posição física.
- GPIO16/17 não são configurados nem acionados. Foi retirado o bloqueio de PSRAM associado à antiga pinagem. Esta versão continua direcionada ao ESP32 clássico; conferir a disponibilidade de GPIO32/33 no módulo físico.
- Testes individuais dos sete relés funcionam mesmo sem token, conexão ao CAD ou ciclo ativo, pela IHM local/AP. São comandos locais temporizados, independentes da comunicação com o CAD.
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
2. Abrir o `.ino` em pasta com o mesmo nome e gravar. Preservar a configuração elétrica LOW do módulo existente. Confirmar `...-r5` no rodapé da IHM após atualizar a página.
3. Entrar na IHM pelo IP local ou pelo AP `192.168.4.1`. Não é necessário jumper GPIO27 nesta compilação.
4. Sem iniciar o CAD, usar **Testar relé · 2 s** em cada um dos sete canais. Cada teste desliga os demais, expira automaticamente e deixa os relés de teste parados. Aguardar 1 s entre testes. Nas guilhotinas, **Fechar e parar bancada** desenergiza todas as saídas.
5. Para sinaleiros, selecionar **Manual · LEDs** e uma cor, ou usar os testes rápidos de 5 s / Automático. A IHM exibe o comando elétrico aplicado.
6. Para o ciclo completo, configurar Wi-Fi 2,4 GHz e token CAD; selecionar **Simulação CAD** na IHM. No CAD 2A, selecionar digestor, consultar Conectar ESP32, ativar S · Simulação real e iniciar o circuito integrado.
7. Confirmar **ESPELHAMENTO CAD ATIVO**: sinaleiros seguem a temperatura simulada; GPIO25/26 alternam durante cozimento; GPIO32 acompanha abertura de alimentação e GPIO33 abertura da descarga. As duas saídas das guilhotinas ficam desligadas quando ambas estão fechadas.
8. **Desarmar e apagar todos / Parar tudo** cancela testes e apaga as saídas. Selecionar novamente Simulação CAD para retomar. Nenhum pacote remoto sozinho desfaz esse desarme.

## Intertravamentos e expiração

O núcleo rejeita alimentação e descarga simultaneamente abertas, ambos os purgadores abertos e várias cores do sinaleiro juntas. A partida é PARADO. Sem pacote CAD completo, digestor correto, modo SIMULACAO, campos coerentes e validade máxima de 6.500 ms, não há espelhamento. Perda do Wi-Fi/pacote ou atraso da tarefa acima de 2 s apaga as saídas e exige nova seleção local. Na compilação opcional com chave obrigatória, abrir GPIO27 também interrompe as saídas.

A requisição `/api/bancada/teste` aceita sete nomes: `vermelho`, `amarelo`, `verde`, `camisa`, `eixo`, `carga_aberta`, `descarga_aberta`. Nomes antigos `carga_fechada`/`descarga_fechada` são recusados: fechar significa desenergizar. Cada teste local dura até 2 s, com os outros seis canais apagados; não depende da rede CAD e não retoma o ciclo ao terminar. Sobreposição é recusada; perda da autorização opcional, falha ou tarefa atrasada interrompe o teste.

Temporizadores locais de purga continuam somente virtuais; usar o ciclo CAD ou os testes individuais temporizados para comutar seus relés. Aquecimento, motor e rotas industriais não são liberados. Firmwares V11 e `esp32-sinaleiros` não foram alterados; este arquivo não é uma atualização para automação real de descarga.

## Verificação

```sh
node --test tests/automacao-esp32-v12-bancada-reles.test.js tests/esp32-v12-bench-state.test.js tests/esp32-v12-ihm-reles.test.js tests/esp32-v12-latencia.test.js
arduino-cli compile --fqbn esp32:esp32:esp32 --warnings all CampoDoGado_ESP32_V12_Bancada_Reles
```

O teste C++ extrai o núcleo e os drivers do próprio `.ino` e os executa com a chave opcional e obrigatória. Verifica sete canais isolados, testes locais sem CAD, expiração, falhas de rede, parada sem rearme, rollover, intertravamento e ausência de escritas em GPIO16/17. A IHM é exercitada com estados disponíveis, teste ativo, perda de contato e bloqueio de placa.

Compilação e testes de software não confirmam montagem, polaridade física ou resposta dos sinaleiros e válvulas. A gravação e o teste de hardware continuam a cargo do responsável pela bancada; não foram executados pelo agente.
