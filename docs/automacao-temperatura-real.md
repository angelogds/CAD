# Sinaleiros por temperatura e evolução das bateladas

## Escopo desta etapa

Cada ESP32 terá sua própria IHM local para acompanhar sensor, sinaleiros,
rede Wi-Fi, integração com o CAD e modo de operação. O sketch V7 fornecido
pelo responsável é a base da atualização em `firmware/esp32-sinaleiros/`.
Preservar pinagem, polaridade dos relés, provisionamento de Wi-Fi e
armazenamento do token. Código compilado não comprova gravação em placa.

Há sinalização, supervisão e dois temporizadores locais de purga.
A indicação “pronto para descarga” significa
que a leitura ultrapassou 120 °C; não libera descarga, abertura de comporta
ou admissão de vapor.

A solicitação posterior acrescentou dois temporizadores locais para os
purgadores, confirmados pelo responsável como duas válvulas por digestor.
O responsável confirmou relés ativos em LOW e válvulas que fecham sem
energia. O firmware configura GPIO25 e GPIO26 e exige armar/iniciar
localmente; nenhum ciclo é retomado na partida. Isso não altera o bloqueio
de comportas e descarga automática. Na V9, o modo de simulação também
leva os estados virtuais das purgas do computador ao ESP32; a atuação
física de teste depende de autorização local por canal.
A tensão das bobinas e a capacidade dos contatos dos relés ainda devem
ser conferidas antes da ligação de potência.

## Faixas

| Temperatura válida | Faixa | Cor | Pronto |
| --- | --- | --- | --- |
| 0 a 50 °C, inclusive | BAIXA | VERDE fixo | Não |
| Acima de 50 e abaixo de 100 °C | INTERMEDIARIA | AMARELO fixo | Não |
| 100 a 120 °C, inclusive | ALTA | VERMELHO fixo | Não |
| Acima de 120 °C | PRONTO | VERMELHO piscando | Sim |

A faixa intermediária também cobre 50,1–50,9 e 99,1–99,9 °C para não haver
lacunas com leituras decimais do PT100. Não há histerese nesta etapa; ela
exigirá limites e critérios acordados antes de mudar a classificação.
Ausência, falha ou leitura inválida de sensor nunca equivalem a 0 °C.

## Dois modos independentes

**SIMULACAO:** usa temperatura simulada, sem PT100. O CAD pode publicar
estados para bancada. Temperatura recebida aparece como sensor simulado,
e não como ausência de PT100. A validade curta do comando continua obrigatória.
As fases legadas continuam existindo para compatibilidade, mas a cor
explícita diferencia amarelo de vermelho fixo dentro da fase MEIO.
Firmware antigo que só interpreta fases precisa ser atualizado antes de
validar as quatro faixas.

Consulte o roteiro e o contrato completos em
[Simulação CAD V9](automacao-simulacao-cad-v9.md), incluindo aquecimento
visual e teste localmente autorizado das duas solenoides.

**REAL:** o ESP32 lê o PT100, classifica e aciona os sinaleiros localmente.
Requisições HTTP e indisponibilidade do CAD não podem bloquear a leitura
nem o pisca. O CAD recebe a decisão e a apresenta como telemetria.
Um comando do simulador não pode substituir a decisão local no modo REAL.
A mudança de modo exige ação local explícita na IHM do ESP32.

## Contrato de telemetria REAL

O ESP32 inicia `POST /api/automacao/device/estado` com token Bearer do
digestor. Exemplo ilustrativo, sem credenciais:

```json
{
  "digestor_id": 1,
  "origem": "REAL",
  "sensor_tipo": "PT100",
  "sensor_status": "VALIDO",
  "temperatura_c": 121.5,
  "faixa_temperatura": "PRONTO",
  "cor_sinaleiro": "VERMELHO_PISCANDO",
  "pronto_descarga": true,
  "timestamp_medicao": "2026-10-25T18:00:00.000Z"
}
```

`timestamp_medicao` identifica a leitura, enquanto último contato indica
comunicação. Um ping novo não transforma leitura antiga em atual. O ESP32
precisa sincronizar o relógio para enviar timestamp confiável; a decisão
local das lâmpadas continua independente disso.

Em falha: `sensor_status` identifica a condição, temperatura e timestamp
ficam nulos, a faixa é `SENSOR_INDISPONIVEL`, a cor é `DESLIGADO` e
`pronto_descarga` é falso. Na referência, as três saídas ficam apagadas.
Isso não significa temperatura baixa ou condição segura para intervenção.
Sem medição atual, o CAD não exibe prontidão atual. Aplicação informada
pelo firmware também não comprova feedback elétrico da lâmpada.

## IHM local de cada ESP32

Identidade: **2A Automação Industrial** e
**Ângelo Gomes da Silva — Fundador**.
Paleta de branco, cinza, vermelho e preto; cores funcionais dos sinaleiros
preservadas. Organizar a página em temperatura e faixa, estado do ESP32,
sensor, sinaleiros, Wi-Fi, integração CAD e modos. Destacar modo REAL ou
SIMULACAO, falha de sensor, desconexão e estado pronto com texto, sem
depender apenas de cor ou animação. Manter uso em celular e movimento
reduzido. Wi-Fi e token devem continuar configuráveis na versão integrada,
sem revelar credenciais salvas nas respostas ou na tela de status.

## Roadmap de bateladas — documentação, sem acionamento nesta etapa

Reaproveitar cadastro de equipamentos, usuários e turnos existentes.
Antes da implementação, confirmar sensores, critérios de início/fim,
regras de pausa, troca de turno e atribuição ao operador. Nenhuma tabela
ou rota de comando para comportas é criada por este roadmap.

| Evento futuro observado | Marco a registrar |
| --- | --- |
| Guilhotina de alimentação abriu | Início do carregamento |
| Guilhotina fechou | Fim do carregamento e início do cozimento |
| Descarga começou, confirmada por sensor | Fim do cozimento e início da descarga |
| Descarga terminou, confirmada por sensor | Fim da descarga e encerramento da batelada |

A temperatura acima de 120 °C registra prontidão térmica; não constitui
evidência de que a descarga começou. O tempo entre prontidão e descarga
deve permanecer identificável.

Estrutura conceitual futura: batelada com identificador, digestor, operador
e turno referenciados; eventos com tipo, horário de medição, horário de
recebimento, dispositivo, origem, qualidade do sensor e identificador
idempotente. Preservar eventos originais e auditar correções. Reinícios,
duplicatas, eventos fora de ordem e perda de sensor devem gerar pendência
de conciliação, sem inventar duração ou atribuição de funcionário.

Indicadores futuros: duração de carregamento, cozimento, espera e descarga;
bateladas por digestor, turno e operador; média por etapa e histórico
rastreável. Comparações de produtividade precisam considerar paradas,
matéria-prima e mudanças de operador. Migrações futuras serão aditivas,
com RBAC e critérios de aceite próprios.

## Dois canais temporizados na IHM

O sketch informado identifica ESP32-D0WD-V3 / ESP32 Dev Module. Os
sinaleiros mantêm GPIO18 (vermelho), GPIO19 (amarelo) e GPIO21 (verde),
com relés ativos em LOW. GPIO25 e GPIO26 são os dois canais adicionais,
também ativos em LOW e desenergizados na partida. A condição fechada sem
energia foi confirmada pelo responsável; não há sensor de retorno das válvulas.

Cada canal possui tempo fechado em minutos e tempo aberto em segundos
(60 segundos = 1 minuto), configuráveis localmente. Os ciclos são
independentes; configurar ou reiniciar não inicia um ciclo. O ciclo começa
com comando fechado e exige armar e iniciar localmente. Parar, falha ou
atraso no processamento desenergiza as saídas sem reproduzir acionamentos
perdidos. O simulador de tempos permanece separado do acionamento real.

Antes da ligação de potência, conferir tensão das bobinas, modelo,
capacidade e isolamento da interface de relés e procedimento operacional.
Os GPIOs fornecem
sinal lógico de 3,3 V e não alimentam bobinas diretamente. Nenhum teste
de software representa validação da ligação elétrica ou ensaio no digestor.

## Verificação antes do uso em placa

Conferir sketch instalado, placa, pinos, polaridade, módulo PT100 e número
de fios. Validar limites 0/50/51/99/100/120/120,1 °C, sensor desconectado,
reinício, modo REAL sem Wi-Fi e expiração de SIMULACAO, com cargas
industriais desconectadas. Compilar e gravar pelo Arduino IDE somente
depois de integrar esses dados. Validação de bancada não autoriza atuação
em comportas ou descarga automática. Ensaiar separadamente os dois canais
de purga, incluindo parada, perda de execução, reinício e desenergização,
antes de validar o uso no equipamento.
