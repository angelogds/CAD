# V9 — simulação do computador aplicada pelo ESP32

## Objetivo e correção

Em SIMULAÇÃO CAD, o computador representa o sensor e o funcionamento do
digestor. Ele gera temperatura, aquecimento visual e estados das duas
purgas. O ESP32 recebe esse pacote, mostra a evolução e aplica os sinaleiros.
O PT100 físico não é necessário nesse modo.

A V8 recusava os pacotes porque exigia `modo: SIMULACAO` no envelope da
API, enquanto a resposta genérica usava `SUPERVISAO`. A V9 valida a origem
do objeto `sinaleiro_bancada` e seus campos; a rota do simulador também
identifica explicitamente o modo. A ausência de PT100 não bloqueia esse
fluxo e não aparece como falha do sensor simulado.

## Como usar

1. Grave o sketch V9 mantendo todos os `.h` na mesma pasta. Use ESP32 Dev
   Module e ArduinoJson 7. Preserve a NVS para manter Wi-Fi e token.
2. No computador, entre no CAD com ADMIN e abra Automação → Digestores →
   Simulador. Selecione o digestor correspondente ao token daquela placa.
3. Marque **Sincronizar seleção com ESP32**. Inicie a simulação e use
   **Iniciar cozimento** no card do digestor para gerar o aquecimento.
4. Na IHM local do ESP32, selecione **Simulação CAD**. Com o pacote atual,
   a página mostra **Sensor simulado · gerado pelo CAD**, temperatura,
   faixa, aquecimento simulado e os estados de camisa/eixo.
5. Para testar fisicamente as solenoides, habilite localmente o teste CAD
   de cada canal desejado. Receber temperatura ou mudar a cor não arma
   uma válvula. O painel deve distinguir o estado virtual recebido do
   comando enviado ao relé e da condição desarmada.
6. Ao pausar/parar o computador, trocar o modo, perder a comunicação,
   vencer o pacote ou reiniciar, os comandos das saídas de teste deixam de
   valer. Para voltar a testar válvulas após desarme, autorize novamente
   cada canal localmente.

O simulador alterna camisa/eixo a cada 30 segundos virtuais. A velocidade
selecionada no computador afeta esse teste: 3× corresponde a uma troca a
cada 10 segundos reais. Os tempos dos ciclos locais de purga continuam
separados desse roteiro gerado pelo computador.

## Canais e limites do teste

| Componente simulado | Saída lógica da placa |
| --- | --- |
| Sinaleiro vermelho | GPIO18, ativo em LOW |
| Sinaleiro amarelo | GPIO19, ativo em LOW |
| Sinaleiro verde | GPIO21, ativo em LOW |
| Purga da camisa / canal 1 | GPIO25, relé ativo em LOW |
| Purga do eixo / canal 2 | GPIO26, relé ativo em LOW |
| Aquecimento | Somente representação visual; nenhum GPIO de aquecedor |

Conferir a identificação das duas válvulas na montagem antes do teste.
Os relés ativos em LOW e as válvulas que fecham sem energia foram
confirmados pelo responsável. Não há retorno elétrico/mecânico de
posição: “comando aberto” não comprova que a válvula abriu. Teste físico
deve ser conduzido com o equipamento isolado para manutenção e sem
pressão/vapor ou movimento de processo que possa tornar o acionamento
perigoso. Não há comando de comporta, admissão de vapor ou descarga
automática de material neste roteiro.

## Contrato PC → ESP32

Dentro de `sinaleiro_bancada`:

```json
{
  "digestor_id": 1,
  "origem": "SIMULACAO",
  "bancada": true,
  "processo_habilitado": false,
  "fase": "MEIO",
  "temperatura_c": 75,
  "faixa_temperatura": "INTERMEDIARIA",
  "cor_sinaleiro": "AMARELO",
  "pronto_descarga": false,
  "versao_fase": 7,
  "validade_ms": 6500,
  "estado_simulacao_disponivel": true,
  "aquecimento_simulado": true,
  "purgadores_simulados": { "camisa": "ABERTO", "eixo": "FECHADO" }
}
```

As faixas de temperatura da V8 são preservadas. O pacote completo de
componentes é necessário para testar saídas de purga; pacote legado sem
esses campos não equivale a autorização para abrir válvula. Armamento é
exclusivamente local e nunca faz parte do JSON recebido do computador.

Mudanças de cor, fase, aquecimento ou estado de purga avançam a versão do
comando. Variações de temperatura dentro da mesma faixa podem renovar a
validade sem criar uma nova versão a cada amostra.

## Telemetria e apresentação

Uma temperatura simulada válida é reportada com `origem: SIMULACAO`,
`sensor_tipo: SIMULADO`, `sensor_status: SIMULADO` e
`fonte_simulacao: CAD`. Testes automáticos locais usam fonte `LOCAL`.
Nenhum deles vira medição REAL de PT100 e nenhum timestamp físico é
inventado. A apresentação diferencia pacote aguardado, pacote vencido,
falha de comunicação e sensor PT100 ausente no modo REAL.

Na persistência legada, a validade do sensor virtual usa `VALIDO` com tipo
`SIMULADO`; a API apresenta `SIMULADO` explicitamente. A migration 236 é
aditiva e guarda os estados virtuais em JSON nas tabelas já existentes,
sem recriar tabelas ou alterar migrations históricas. A supervisão aplica
validade e correlação do comando aos dados CAD e retira estado atual e
prontidão quando eles vencem, inclusive se uma requisição fica pendente.

## Operação com PT100

O modo REAL continua usando exclusivamente o leitor físico e a decisão
local do ESP32. Um pacote do CAD não substitui a leitura nem muda esse
modo. O PT100 continua desabilitado até confirmar módulo e fiação; isso
não impede a SIMULAÇÃO CAD nem os testes locais disponíveis.

## Identidade do painel no CAD

Digestores e Simulador usam o mesmo padrão da IHM local: fundo cinza,
cards brancos, ações vermelhas e texto escuro, com identificação da 2A
Automação Industrial e de Ângelo Gomes da Silva — Fundador. As cores
verde, amarelo e vermelho continuam indicando as faixas dos sinaleiros.
O tema fica restrito a esses painéis e preserva a navegação e as permissões
do restante do sistema.
