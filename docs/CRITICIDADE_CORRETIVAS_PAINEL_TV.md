# Criticidade: base corretiva compartilhada pelo painel e TV

## Correção da origem dos dados

A migration 111 adicionou `os.tipo_manutencao` com default `CORRETIVA`. A criação de OS grava o tipo em `os.tipo`. Por isso uma preventiva podia ter `tipo=PREVENTIVA` e `tipo_manutencao=CORRETIVA`, e a consulta antiga de criticidade priorizava o segundo campo. O resumo de OS e o tempo até fechamento também incluíam todos os tipos.

A migration **245** cria `vw_criticidade_os_corretivas`, com índices para o período/equipamento e os vínculos preventivos. Não apaga OS nem reclassifica o histórico original. O predicado em `utils/os-maintenance-type.js` é compartilhado com o serviço, inclusive em bases sem a view.

- Tipo preventivo, preditivo, inspeção ou lubrificação em qualquer campo impede contagem como falha corretiva.
- Origem preventiva/lubrificação e vínculos oficiais com execução preventiva ou programação/execução de lubrificação também impedem a contagem, mesmo quando um campo antigo diz `CORRETIVA`.
- Entre os campos de tipo, o tipo operacional não vazio precede o default legado. Tipos corretivos históricos explícitos `EMERGENCIAL`, `FALHA`, `QUEBRA` e `CRITICA` permanecem reconhecidos. Prioridade alta, descrição e ausência de tipo não são usadas para inventar falhas. Canceladas são excluídas.
- Sem filtro explícito de cadastro, os equipamentos ativos são usados. Inativos continuam disponíveis pelo filtro histórico.

## Painel, detalhe e TV

`operational-criticality.service.js` é a fonte dos três fluxos: card no painel principal, página de criticidade/histórico e snapshot da TV. A TV deixou de calcular criticidade sobre as últimas 500 OS de todo o histórico, sem janela temporal.

A janela padrão é de 30 dias, com datas civis do Brasil. O Modo TV aberto pelo painel preserva setor e período: janelas relativas seguem móveis a cada consulta; datas personalizadas permanecem fixas. O resumo considera todos os equipamentos no recorte, enquanto o ranking exibe os cinco com mais ocorrências. O mesmo desempate é aplicado nas três telas.

Contagens, reincidência em até 15 dias, intervalos médios e tempo até fechamento usam apenas as corretivas filtradas. A série do painel é calculada sobre as ocorrências reais. O tempo até fechamento é o intervalo civil entre abertura e fechamento, sem arredondar para dias inteiros; não representa horas efetivamente trabalhadas. “Média entre falhas” também é um intervalo civil, sem inferir horas operadas.

A prioridade atual e a quantidade de corretivas abertas são consultadas diretamente nas OS corretivas ativas dos equipamentos do ranking, inclusive aberturas anteriores à janela. O histórico encerrado permanece contado no recorte, com **Sem corretiva aberta**, sem transformar um equipamento reparado em pendência crítica. A posição no gráfico não gera uma classificação crítica relativa. As sugestões históricas são identificadas como acompanhamento e não abrem serviços automaticamente. A criticidade patrimonial/engenharia do cadastro e do PCM não é sobrescrita.

## Atualização e cache

A TV reutiliza o polling e o endpoint existentes. A criticidade é consultada novamente em cada snapshot, sem o cache de 60 segundos do painel gerencial da TV. O fechamento e a reclassificação de OS se refletem na próxima consulta. O estado offline continua explícito na TV.

O service worker ignora a navegação operacional `/`, `/dashboard`, `/tv` e `/api/tv/`, e remove cópias antigas dessas entradas ao ativar. HTML operacional sai da lista de precache; os assets estáticos continuam disponíveis. CSS e JavaScript alterados recebem versão nova.

## Verificação

Regressões cobrem o conflito entre campos, origens e vínculos preventivos, cancelamento, tipos vazios, acentuação, janelas, cadastro inativo, horas fracionárias, igualdade painel/TV com mais de 500 preventivas, fechamento na consulta seguinte e cache antigo. QA com servidor/SQLite isolados verifica o painel, o módulo, o detalhe e a TV em 390, 1280, 1440 e 1920px, inclusive os cinco equipamentos com nomes longos e janela relativa ao abrir o Modo TV. Nenhuma OS real é alterada durante a validação.
