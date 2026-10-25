# ESP32 V9 — sensor simulado pelo CAD, sinaleiros e purgadores locais

Evolução do sketch `bancada-v7` fornecido pelo responsável, para **ESP32-D0WD-V3 / ESP32 Dev Module**, Arduino IDE. O firmware completo está em `esp32-sinaleiros.ino`; mantenha os demais `.h` na mesma pasta. Instale **ArduinoJson 7** pelo gerenciador de bibliotecas. A compilação foi preparada com Arduino ESP32 core 3.3.0.

## Sinaleiros

Pinos e polaridade preservados do sketch informado: GPIO18 vermelho, GPIO19 amarelo e GPIO21 verde, relés ativos em **LOW**. A inicialização mantém todos desligados. Manual, teste rápido, teste automático e simulação CAD continuam disponíveis; o automático testa agora **quatro** faixas de 5 segundos e encerra em 20 segundos.

A classificação usa valores contínuos: `0 ≤ T ≤ 50` verde; `50 < T < 100` amarelo; `100 ≤ T ≤ 120` vermelho fixo; `120 < T ≤ 850` vermelho piscando. A interpretação contínua evita lacunas em 50,5 °C e 99,5 °C. Valores negativos, acima do limite PT100 de 850 °C, `NaN`, infinito ou falha do sensor não geram pronto. Histerese fica futura para preservar os limites exatos desta etapa.

O modo REAL decide a faixa e comanda os três GPIOs na tarefa local, sem consultar CAD ou Wi-Fi. Aquisição e GPIOs rodam separadamente das requisições HTTP/TLS. Falha/ausência do sensor ou amostra abandonada desliga os sinaleiros e retira pronto. O vermelho pisca com 500 ms ligado e 500 ms desligado.

**PT100 permanece desabilitado por configuração**, pois módulo, fiação, quantidade de fios e resistor de referência ainda não foram informados. O adaptador disponível é para MAX31865 via SPI; confirme se esse é o módulo utilizado antes de habilitar. Em `hardware_config.h`, preencha os quatro pinos SPI, número de fios e resistor conforme o hardware conferido, e só então altere `CGD_ENABLE_PT100` para `1`. Pinos conflitantes com sinaleiros, purgadores, flash ou sem capacidade de saída são rejeitados. Não é necessária biblioteca Adafruit. O modo REAL é bloqueado na IHM enquanto esse leitor não estiver configurado.

## Dois purgadores por ESP32

O responsável confirmou relés que ligam em **LOW** e válvulas que **fecham sem energia**. O driver de comando está preparado e habilitado para GPIO25 (canal 1) e GPIO26 (canal 2). Estes GPIOs comandam somente a interface de relés compatível com o ESP32; o firmware não define a ligação de potência ou a tensão das bobinas.

Cada canal tem tempos próprios, gravados em NVS: fechado de 1 a 120 minutos e aberto de 1 a 300 segundos. Padrões: canal 1 fechado 5 minutos; canal 2 fechado 10 minutos; ambos abertos por 60 segundos. O primeiro período após iniciar é sempre **fechado**.

- **Armar saída** habilita aquele canal localmente e mantém o relé desenergizado. Não inicia um ciclo.
- **Iniciar ciclo** exige armamento anterior. Os ciclos continuam no ESP32, independentemente de Wi-Fi/CAD.
- **Testar simulação** desarma a saída física daquele canal e executa somente o temporizador virtual.
- **Parar** fecha/desarma o canal. **Parar tudo** fecha/desarma ambos e apaga sinaleiros.
- Alterar os tempos para o canal, trocar o modo de sinalização, reiniciar ou detectar falha relevante exige novo armamento/início. O armamento e o estado aberto nunca são restaurados de NVS.

O ciclo físico pode ser iniciado com os sinaleiros parados, sem depender de PT100, ou em operação REAL com sensor válido. O ciclo autônomo local não pode ser armado em modos manual, teste ou simulação CAD. O teste físico comandado pelo CAD tem autorização própria, descrita abaixo. Em REAL, falha do PT100 fecha/desarma os canais. Atraso no atendimento do temporizador acima de 2 segundos encerra o ciclo fechado, sem reproduzir pulsos perdidos. Falha de sincronização da tarefa força saídas desligadas e requer novo comando local.

A IHM mostra **comando aberto/fechado** e **relé habilitado/armado**. Não existe entrada de retorno: isso não confirma mecanicamente a posição da válvula, o contato do relé ou a descarga de água. Para bloquear o driver físico em uma compilação de bancada, use `CGD_ENABLE_PURGE_OUTPUTS 0`.

## IHM e configuração

A página local usa branco, cinza, vermelho e preto, com a identidade solicitada. Exibe quatro cards de digestor; somente o card vinculado a `DIGESTOR_ID` apresenta leitura deste ESP32. Os demais mostram outro ESP32/sem telemetria, sem inventar valores. Para outros equipamentos, altere `DIGESTOR_ID` e configure o token correspondente. O AP do Digestor 1 mantém `CampoDoGado-ESP32`; os demais recebem sufixos `-D2`, `-D3` e `-D4` para distinguir as centrais.

Wi-Fi e CAD ficam em um módulo de configuração recolhido por padrão. Foram preservados o AP de configuração, busca de redes, teste antes de salvar, reconexão e as namespaces `wifi-digestor` e `cad-esp32`, de modo que a gravação sem apagar NVS mantenha a rede e o token existentes. A página nunca devolve senha ou token. Os POST exigem origem local e `X-CGD-Local: true`; a configuração LAN continua HTTP, destinada à rede de manutenção confiável. O canal ESP32 → CAD mantém validação TLS/certificados e Bearer token.

Os tempos de purga usam uma namespace separada `purga-sim`, reaproveitando o nome da preparação de bancada, mas o modo/armamento físico não é persistido.

## Telemetria e segurança de estado

REAL publica `temperatura_c`, `faixa_temperatura`, `cor_sinaleiro`, `pronto_descarga`, `sensor_tipo=PT100`, `sensor_status`, `timestamp_medicao` UTC com milissegundos e `origem=REAL`. Em falha, temperatura/timestamp são nulos, faixa é `SENSOR_INDISPONIVEL`, cor `DESLIGADO`, pronto `false`. Sem relógio sincronizado, a decisão local continua; nenhum timestamp inventado é enviado ao CAD.

SIMULAÇÃO válida publica origem explícita, temperatura simulada e `sensor_tipo/sensor_status=SIMULADO`; não depende de PT100 físico. A origem da leitura fica identificada por `fonte_simulacao=CAD` ou `LOCAL`. Sem pacote, a IHM mostra aguardando simulação; uma leitura vencida aparece como simulação expirada, sem indicar falha de PT100. O poll do CAD deve fornecer temperatura/faixa/cor/pronto coerentes e validade de até 6.500 ms. Comando vencido/ausente apaga os sinaleiros, mantendo a seleção de simulação. Nenhuma resposta de rede troca o firmware para REAL ou arma purgadores. Somente a ação local específica de teste CAD libera cada relé para seguir as válvulas virtuais.

Ao parar ou mudar para manual, o firmware também publica estado sem pronto para limpar a supervisão anterior do CAD. `cor_sinaleiro` descreve o GPIO comandado, **sem confirmação elétrica**; o firmware nunca envia `saida_confirmada` inventada. Não foram adicionados controles de carregamento, comporta, vapor ou descarga automática de material.

## V9 — testar o equipamento montado com sensor simulado pelo computador

1. No computador, abra o simulador CAD, selecione o digestor e marque **Sincronizar seleção com ESP32**. Carregue o digestor e use **Iniciar cozimento**, mantendo o simulador em execução.
2. Na IHM desse ESP32, confirme Wi-Fi/token e selecione **Simulação CAD**. O card deve mostrar **Sensor simulado · PC**, temperatura e cor iguais às do computador. O PT100 pode continuar desconectado/desabilitado.
3. Confira as duas válvulas virtuais recebidas: **Camisa = canal 1 / GPIO25**, **Eixo = canal 2 / GPIO26**. Aquecimento é somente um indicador virtual; não existe GPIO ou comando físico de aquecimento/admissão de vapor.
4. Para testar o solenoide montado, use **Armar teste pelo CAD** no canal desejado, localmente. A partir dessa autorização, o relé desse canal segue ABERTO/FECHADO do computador; se a válvula virtual já estiver aberta, o relé poderá ser energizado imediatamente. Cada canal exige sua própria autorização; o computador nunca os arma.
5. Parar/pausar a simulação, vencer a validade do pacote, perder Wi-Fi, mudar de modo, reiniciar ou parar o canal fecha/desarma o teste. Reconexão e retomada do computador não rearmam: repita a autorização local quando apropriado.

Esse fluxo usa `aquecimento_simulado` e `purgadores_simulados` de um pacote completo, identificado por `estado_simulacao_disponivel=true`. Uma temperatura simulada legada pode acender sinaleiros sem liberar o teste físico dos purgadores. Um atraso maior que 2 segundos na tarefa local também remove o armamento, mesmo que a tarefa de rede tenha recebido novos comandos.

Os temporizadores autônomos locais continuam separados: com os sinaleiros parados, **Armar saída** mantém fechado e **Iniciar ciclo** inicia o período fechado configurado. **Testar simulação** executa somente o temporizador virtual. O modo REAL continua exigindo PT100 válido e ignora o sensor/válvulas simulados do computador.

As indicações são de comando dos GPIOs, sem retorno elétrico ou confirmação mecânica. Faça o comissionamento com o processo isolado para manutenção e o circuito de relés já conferido; o firmware não define a ligação de potência dos solenoides.

## Validação

Na raiz do repositório:

```bash
node --test tests/esp32-temperature-firmware.test.js tests/esp32-purge-timer.test.js tests/esp32-purge-outputs.test.js tests/esp32-cad-protocol.test.js tests/esp32-cad-purge-test.test.js tests/esp32-local-ui.test.js
```

Os testes compilam/executam os mesmos núcleos C++ do firmware com `g++`: limites/fracionários, falhas, pisca, isolamento REAL/SIMULAÇÃO, expiração, rollover, dois temporizadores, partida fechada, armamento separado de início, polaridade LOW e desligamento/desarme. Os testes de protocolo usam a resposta real de referência com wrapper SUPERVISAO e origem SIMULACAO no objeto do sinaleiro; o adaptador ArduinoJson chama o mesmo validador portátil. O parse completo foi executado também em C++ host com ArduinoJson 7.4.2. A compilação específica da placa valida o sketch e dependências. Nenhum teste de software comprova montagem elétrica, calibração do PT100, tensão de bobinas ou funcionamento físico das válvulas; não foi realizada gravação ou intervenção no equipamento.
