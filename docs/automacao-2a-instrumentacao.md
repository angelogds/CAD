# 2A Automação Industrial — estudo da área de decanters e prensas

Este documento orienta o painel integrado ao CAD (Manutenção Campo do Gado). O circuito informado pelo responsável é a referência de arranjo. Tags, posições e permissivos abaixo são propostas para levantamento de campo; não constituem projeto executivo, liberação de máquina ou configuração de proteção. A simulação do navegador não escreve em CLP, ESP32, inversor, válvula ou banco de produção.

## Circuito representado

Entrada de sebo → tanque de serviço de **15.000 L** → bomba helicoidal de alimentação → coletor com seleção FAST ou GRATE → decanter selecionada. Sob cada decanter há um tacho para coleta do sebo; a borra segue para a rosca inferior comum. Os tachos alimentam o conjunto de duas bombas de saída, com seleção da bomba 1 ou 2, e o coletor externo. Os tanques de armazenamento 1–5 aparecem como expansão futura, sem capacidade, níveis, válvulas ou disponibilidade real presumidos.

A conexão cruzada entre os dois tachos e as duas bombas, o sentido de cada linha, retenções e isolamentos precisam ser conferidos no local. O desenho é funcional e sem escala; não autoriza alterações na tubulação existente.

## Tanque de serviço e pontos de medição

| Tag conceitual | Local no desenho | Informação prevista | Limite da informação |
| --- | --- | --- | --- |
| FT-IN | Linha de entrada do tanque | Vazão e total recebido na área | Recebido não é, por si só, produção final |
| LSL / LS1 | Região inferior útil | Patamar de 10% / 1.500 L | Reserva proposta; depende da sucção e da imersão mínima |
| LS2 | Região intermediária inferior | Patamar de 25% / 3.750 L | Posição física depende da cubagem |
| LS3 | Região intermediária | Patamar de 50% / 7.500 L | Não transforma a indicação em leitura contínua |
| LS4 | Região intermediária superior | Patamar de 75% / 11.250 L | Posição física depende da cubagem |
| LSH / LS5 | Região superior útil | Patamar de 90% / 13.500 L | Aviso de nível alto proposto; margem livre a dimensionar |
| TT-101 | Lateral, imerso na faixa útil | Temperatura do sebo por PT100 e transmissor | Mede no ponto instalado; não comprova uniformidade do tanque |
| M-101 / ZS-101 | Motor e eixo do mexedor | Comando, retorno de funcionamento e rotação | Contator ligado não comprova eixo girando; rotação não comprova homogeneidade |
| XV-ST / ZSO-ST / ZSC-ST | Linha de vapor do tanque | Solicitação, retorno aberta e retorno fechada | Retorno de válvula não comprova vazão de vapor ou troca térmica |

**10/25/50/75/90% são posições volumétricas conceituais**, usadas apenas para organizar o estudo e a demonstração. Não equivalem automaticamente à mesma porcentagem da altura. A geometria, fundo, volume morto, inclinação e posição dos bocais determinam a curva altura × volume. Antes da instalação, levantar dimensões e cubar o tanque.

Cinco chaves de nível fornecem seis faixas. Por exemplo, LS1–LS3 atingidas e LS4–LS5 livres indicam aproximadamente **7.500 a 11.250 L**, depois da calibração. Todas livres indicam uma faixa inferior, e não tanque comprovadamente vazio; todas atingidas indicam faixa superior, e não exatamente 15.000 L. Uma chave superior atingida com outra inferior livre é incoerência: mostrar **nível indisponível**, sem converter a falha em zero. Prever diagnóstico de cabo, alimentação, aderência e oscilação por agitação.

A distinção entre chave pontual e medição contínua é descrita pela [VEGA](https://www.vega.com/en/products/product-catalog/switching). Se o objetivo evoluir para estoque contínuo, estudar um transmissor apropriado, mantendo proteção independente de transbordo quando exigida pela análise da instalação. A tecnologia deve atender sebo quente, aderência e incrustação; não selecionar uma chave condutiva apenas por ser econômica.

## Temperatura, mexedor e vapor

A faixa ideal de alimentação da FAST/GRATE precisa ser definida pelo processo e pelos manuais das máquinas instaladas. Não copiar uma temperatura de outra indústria, de outra matéria-prima ou dos digestores. O painel deve mostrar mínimo/máximo **a definir** até esse levantamento; valores escolhidos na demonstração são didáticos.

Para o PT100, conferir elemento, ligação 2/3/4 fios, transmissor, poço, inserção, materiais, limites e calibração. O ponto deve representar a massa de sebo e não a parede aquecida ou um jato de vapor. A instalação mecânica do poço e a condição da linha de vapor precisam de avaliação específica.

Na IHM, separar **comando solicitado**, **retorno recebido** e **qualidade/idade do sinal**. A animação das hélices representa movimento informado/simulado. Para avaliar homogeneização, além de rotação, levantar geometria/estado das pás, imersão, tempo de mistura e diferenças de temperatura ou amostras em posições representativas. Um único PT100 e um retorno de motor não comprovam homogeneidade.

O conjunto de vapor deve ter sua regulação e proteções próprias. A proposta supervisória contempla falha de PT100, temperatura acima do limite aprovado, nível insuficiente para o sistema de aquecimento e divergência comando/retorno. Não pressupor que o CAD seja a camada de proteção de pressão ou temperatura.

## Quantidade de sebo na noite

Definir duas fronteiras de medição independentes:

- **FT-IN — recebido:** material que entra no tanque de serviço.
- **FT-OUT — transferido:** sebo clarificado no coletor final, após a união das bombas 1/2 e antes de derivações de armazenamento, num ponto que não conte recirculação duas vezes.

Um totalizador em FT-OUT informa **transferido no turno**. Para chamá-lo de **produzido no turno**, é necessário acertar a fronteira contábil e considerar eventual estoque inicial/final nos tachos e linhas, retornos, lavagem e retrabalho. Os cinco sensores pontuais do tanque de serviço não permitem fazer essa correção com precisão. Se a medição ficar na saída de cada decanter, estudar como somar dois medidores sem dupla contagem.

A [KROHNE documenta uma aplicação em gordura animal líquida](https://www.krohne.com/en-us/applications/measuring-flow-liquid-animal-fat) na qual baixa condutividade e densidade variável prejudicavam a medição anterior. Isso sustenta estudar o princípio de medição para este fluido, sem prescrever automaticamente um modelo. Levantar vazão mínima/máxima, viscosidade, sólidos, ar arrastado, pressão, temperatura, diâmetro, perda de carga, limpeza e faixa de operação. Caso o resultado desejado seja massa, não adotar **1 L = 1 kg**; medir massa ou usar densidade válida nas condições acordadas.

O fechamento noturno deve ser configurado com início/fim do turno em **America/Sao_Paulo**, inclusive quando cruza a meia-noite. Proposta para futura integração:

1. Guardar leituras acumuladas e carimbo de tempo/qualidade na abertura e no fechamento; não zerar o instrumento a cada turno.
2. Calcular diferença apenas entre leituras válidas do mesmo contador e unidade. Identificar reinício, troca de instrumento, rollover e lacunas; nunca transformar contador decrescente em produção negativa ou automaticamente em zero.
3. Separar resultado completo de parcial/indisponível. Registrar recirculação, retorno e CIP para exclusão conforme a fronteira definida.
4. Manter trilha de ajustes e evitar que duas bombas no mesmo medidor gerem dois lançamentos do mesmo volume.

Na versão demonstrativa, o total é **simulado**, da sessão do navegador, sem validade para fechamento de produção, persistência oficial ou estoque.

## Permissivos propostos para estudo

As ações abaixo são requisitos de engenharia a confirmar com o fabricante e a análise de riscos. Uma falha de alimentação pode exigir cortar o fluxo sem desligar abruptamente o rotor da decanter. Sequências de partida, limpeza, desaceleração, purga e parada devem continuar sob o controle previsto pelo fabricante.

| Condição a monitorar | Complemento de lógica proposto | Evidência necessária antes da implementação real |
| --- | --- | --- |
| Nível baixo ou incoerente no tanque | Inibir alimentação e anunciar causa; revisar permissão de mistura/aquecimento conforme imersão | Cubagem, níveis mínimos, diagnóstico das chaves |
| PT100 inválido ou faixa de processo não definida | Não declarar temperatura apta para alimentação; anunciar indisponibilidade | Faixa aprovada, transmissor e teste de falhas |
| Bomba helicoidal em seco, pressão excessiva ou sem vazão esperada | Retirar alimentação e identificar falha local; não insistir em partidas | Proteção de estator/fluxo, pressão e limites OEM |
| Seleção FAST/GRATE inexistente ou divergente | Bloquear alimentação até caminho confirmado; troca somente em sequência aprovada | Retornos das válvulas, posições e interligações reais |
| Decanter sem liberação | Não alimentar; mostrar qual requisito falta | Rotação, diferencial, torque, vibração, temperatura e alarmes do controlador OEM |
| Rosca de borra parada/bloqueada ou saída indisponível | Retirar alimentação; manter sequência de parada OEM | Retorno de rotação/corrente, permissivos e escoamento verificados |
| Tacho alto/alto-alto ou saída de líquido indisponível | Retirar alimentação conforme causa/efeito aprovado; anunciar risco de transbordo | Capacidade útil, margens, sensores e lógica das bombas |
| Bomba de saída selecionada sem condição de sucção/destino | Impedir partida na proposta; impedir seleção conflitante de bombas | Nível do tacho, pressão/fluxo, válvulas, retenções e capacidade do destino |
| Sinal ausente, vencido ou comunicação perdida | Mostrar sem sinal; não manter animação como confirmação de operação | Watchdog e resposta local do controlador validados |

A [NETZSCH descreve proteções de operação seca, rotação e pressão para bombas de deslocamento positivo](https://pumps-systems.netzsch.com/en/products-and-accessories/accessories-optional-equipment/accessories-and-optional-equipment-for-pumps-and-systems). As proteções instaladas devem atender o modelo de bomba e estator da fábrica; o nível do tanque sozinho não identifica toda obstrução, entrada de ar ou falta de produto na sucção.

As [instruções de segurança de decanter da Alfa Laval](https://www.alfalaval.no/globalassets/documents/products/separation/centrifugal-separators/decanters/alfa-laval-decanter-centrifuge-safety-instructions.pdf), páginas 4–5 do PDF, exigem descarga disponível antes de alimentar e retirada do fluxo se o transporte de saída parar ou bloquear. Também distinguem parada controlada de emergência. Isso é uma referência de fabricante para a análise, **não confirmação de que este manual pertence à FAST ou à GRATE instalada**. O efeito do tacho como pulmão e eventual operação cíclica das bombas precisam ser conciliados com os manuais reais; o buffer simplificado da demonstração não prova essa viabilidade.

A [Alfa Laval recomenda acompanhar velocidade, alimentação, vibração e temperatura de mancais](https://www.alfalaval.com/service-and-support/ten-top-tips/ten-top-tips-decanters/). Limites e tempos de confirmação devem vir da máquina instalada, sem reaproveitar números de outro modelo. O rotor e a rosca interna da decanter não são a mesma coisa que a rosca externa de transporte de borra.

## Complementos para as prensas

Preservar o CLP/IHM existente e estudar primeiro leitura supervisionada. Organizar três caminhos visuais: alimentação, extração de sebo para coleta e saída de torta/borra para transporte. A terceira prensa permanece com identificação a validar, sem inventar um modelo.

Proposta de instrumentação: motor em funcionamento, falha do acionamento, corrente/torque, rotação do eixo após o redutor/acoplamento, temperatura de mancais/redutor quando aplicável, nível na alimentação/coleta e disponibilidade dos transportadores de saída. Separar retorno de motor de movimento do eixo para identificar possível acoplamento/pino/redutor interrompido. Alarmes não devem incentivar forçar uma prensa travada ou inverter/rearmar automaticamente.

A [Haarslev apresenta controle de carga, torque e pressão de cone em uma prensa de gordura](https://pt.haarslev.com/product/fat-screw-press-fsp3500). A referência apoia avaliar essas variáveis quando existirem na máquina; não comprova que P50/P46 tenham cone hidráulico, sensores ou o mesmo controlador. Qualidade de extração requer amostra/análise do produto e da torta; corrente sozinha não mede gordura residual.

Sequências de alimentação/descarga, partidas, ajuste de cone, reversão e limpeza dependem do procedimento OEM. A supervisão deve mostrar condições e causas de indisponibilidade, sem substituir guardas, intertravamentos ou emergência.

## Levantamento necessário para aproximar o desenho da fábrica

- Fotos gerais e laterais do tanque, agitador, entrada/vapor/saída, bomba helicoidal, FAST/GRATE, tachos, rosca e bombas externas; medidas de referência e sentido do fluxo.
- Placas e manuais das duas decanters, bombas, prensas, motores, redutores e instrumentos existentes.
- Capacidade útil e dimensões de cada reservatório; posições dos bocais e forma do fundo; cotas de sucção e imersão.
- Lista de I/O e protocolos disponíveis no CLP/inversores, sem credenciais em fotos; quais sinais são comando, retorno, falha ou variável medida.
- Temperatura/faixa de processo aprovada, condições de vapor, pressões, material/tipo das válvulas e comportamento na perda de energia.
- Matriz causa/efeito, responsabilidade de controle local, parada controlada e testes de comissionamento. Ensaios físicos exigem preparação e autorização de campo próprias.

As fontes foram consultadas em 25/10/2026. Nenhuma seleção de instrumento ou limite operacional foi validada em campo neste trabalho.
