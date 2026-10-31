# 2A Automação Industrial — ESP32 V11: ciclo visual e futura operação real

> Registro de engenharia (30/10/2026). **Implementado em software:** espelhamento visual da simulação, não acionamento elétrico. **Não homologado:** comando industrial real de válvulas/guilhotinas, instrumentação de motor e lógica de segurança.

## Objetivo
A IHM local de cada digestor deve acompanhar o CAD em modo **SIMULAÇÃO**. Na maquete, a guilhotina de entrada abre durante CARGA e fecha antes de COZIMENTO; o motor virtual acende e os empurradores/purgadores **camisa/eixo** demonstram alternância durante COZIMENTO; a guilhotina de descarga abre somente na etapa DESCARGA (após critério térmico simulado >120 °C e pronto), fechando antes de TRANSFERENCIA. A percoladora e o tacho seguem na cena do CAD. Tudo é virtual e não atesta posição/pressão/rotação físicas.

## Firmware V11
- Arquivo único: [CampoDoGado_ESP32_V11_Simulacao_Integrada.ino](https://github.com/angelogds/CAD/blob/main/firmware/releases/CampoDoGado_ESP32_V11_Simulacao_Integrada.ino)
- Identificação em /api/estado e na página IHM: `temperatura-v11-simulacao-atuadores-visuais`.
- Dados CAD: `guilhotinas_simuladas.{carga,descarga}` (ABERTA/FECHADA); `empurradores_simulados.{camisa,eixo}` (ABERTO/FECHADO); `motor_digestor_simulado` (boolean); `etapa_mecanica` (CARGA/COZIMENTO/DESCARGA/TRANSFERENCIA/PARADO/CONCLUIDO). O protocolo mantém `purgadores_simulados` separados para compatibilidade.
- No ESP32, o pacote CAD fresco (janela máxima 6,5 s) altera **apenas snapshot e IHM**, jamais `digitalWrite` dos atuadores. Perca de pacote/modo ou expiração: estado virtual fechado, motor desligado, saída real não habilitada.
- Os pinos reservados para o piloto são GPIO32/33 (guilhotina carga, abertura/fechamento) e GPIO16/17 (guilhotina descarga); GPIO25/26 para os dois canais de purgadores. Eles **não autorizam ligação de bobina** nem validam o tipo de válvula. `CGD_ENABLE_MATERIAL_GATE_OUTPUTS=0` e simulação CAD força purgadores físicos desarmados.
- O tempo de abertura/fechamento local dos purgadores é parametrizado na IHM para **futura operação real**, não determina o tempo da maquete CAD.
- Não há retorno físico de posição e nenhum pino de entrada do motor foi homologado.

## Matriz de funcionamento
| Modo | Fonte | Motor/empurradores/guilhotinas | Saídas físicas |
| --- | --- | --- | --- |
| Simulação CAD | CAD + protocolo com validade | Estados e animações no ESP32; ordem carga → cozimento → descarga | Bloqueadas; zero movimento real |
| Parado | Local | Sem demonstração CAD atual | Desarmadas; testes locais isolados só após homologação |
| Produção real (futuro) | Comandos e permissivos locais, sensores | Motor monitorado, empurradores com temporização local, guilhotinas sob ordem de operador | Somente após projeto de segurança e comissionamento |
| Queda de rede/estado inválido | Nenhuma | Indicação de falha, estados visuais seguros | Nenhum movimento por comando remoto |

## Requisitos para iniciar a fase real (pendências)
1. Mapear circuito de comando do motor do eixo do digestor; preferir **contato auxiliar comprovado de motor em funcionamento** ou monitor de corrente/rotação com condicionamento adequado, em vez de ligar o ESP32 ao circuito 220/380 V. O contato auxiliar de contator só confirma estado do contator, não rotação efetiva: avaliar retorno de velocidade conforme risco.
2. Validar nível elétrico, opto-isolação, referência 24 Vcc, proteção, segregação de potência, supressão de transientes e entradas digitais do CLP/ESP32. Definir supervisão de curto/ruptura se necessária.
3. Identificar tipo de cilindro/válvula pneumática: simples ou dupla solenoide, retenção, retorno após perda de ar/energia. Verificar pressão, fins de curso ABERTA e FECHADA, sensores de falha de movimento e posição, intertravamento com abertura de portas.
4. **Guilhotinas:** operador libera carregamento e descarga por botoeira local ou IHM física segura. Nunca transformar o bit `pronto_descarga` ou motor ativo em comando de abertura. Exigir permissivos, confirmação de parada/pressão/temperatura e procedimento de segurança aprovado.
5. **Empurradores/purgadores:** investigar relação entre motor ligado, necessidade de purga e temporização local; definir se o controle será por contator auxiliar, CLP, pressão/posição, e validar sequência com a operação. Motor ON isolado não autoriza movimento.
6. Habilitação da produção apenas com revisão elétrica e mecânica, análise de risco (NR-12 / normas aplicáveis), E-stop e proteção cabeada independentes de Internet/CAD, teste a seco, comissionamento supervisionado, documentação e assinatura dos responsáveis.
7. Registrar tempo real do ciclo e operador no módulo `/automacao/digestores/ciclos`; o navegador CAD não pode atribuir ciclos virtuais à produtividade real.

## Testes e validações
- Node: `tests/automacao-esp32-v11-atuadores-visuais.test.js` (sequência CARGA → COZIMENTO → DESCARGA, pacotes antigos, motor/empurradores e rejeição de valores inválidos).
- Arduino CLI: `.github/workflows/esp32-v11-simulacao-integrada.yml`, placa ESP32 Dev Module, core 3.3.12, ArduinoJson 7.4.3.
- Teste funcional a fazer: CAD autorizado e ESP32 via Wi-Fi, selecionar `Simulação CAD` na IHM do ESP32; no CAD escolher `Integrado · elétrica + mecânica` e iniciar. Verificar em /api/estado passagem de `etapa_mecanica`, `motor_digestor_simulado`, `empurradores_simulados` e `guilhotinas_simuladas`. Pausar/fechar rede deve expirar visualizações. Teste no circuito real **não executado**.

## Referências
- [PR #721 — V11 motor e empurradores na simulação](https://github.com/angelogds/CAD/pull/721)
- [PR #719 — V10 CAD/ESP32 e histórico de ciclos](https://github.com/angelogds/CAD/pull/719)
- Documento anterior do Notion: [2A Automação Industrial — Circuitos dos digestores e decanters](https://app.notion.com/p/4057ddca327c819980e7d8210af8faf7)
