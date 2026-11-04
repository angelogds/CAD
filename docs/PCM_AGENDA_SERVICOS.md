# Agenda de serviços e instalações do PCM

A aba **Agenda de serviços** usa a URL existente `/pcm/programacao-semanal`. Reúne as OS já programadas com as etapas das demandas, sem abrir OS nem iniciar execução ao salvar uma data.

## Fluxo operacional

1. Cadastre a demanda normalmente. Para uma fabricação que precisará ser colocada no local depois, marque **Exige instalação posterior** no cadastro ou na própria demanda.
2. No PCM, abra a agenda e a fila **Demandas aguardando programação**. Defina data, horário opcional, mecânico responsável, local, duração e preparação de materiais.
3. Salvar ou reprogramar envia um aviso dentro do aplicativo. O calendário permite buscar, filtrar etapa, responsável e situação, e navegar entre semanas.
4. A gestão registra início, conclusão com data realizada ou cancelamento da programação. Iniciar/concluir um serviço da demanda também atualiza a demanda. Cancelar a programação mantém a demanda disponível para novo planejamento.
5. Quando a demanda de fabricação é concluída, ela aparece na fila como **Instalação após fabricação**. A instalação só pode ser programada com a fabricação concluída e a marcação habilitada.
6. Confirme a instalação com a data em que ocorreu. A conclusão da fabricação e a instalação são etapas distintas; uma instalação realizada não pode ser reprogramada.

Demandas antigas não são classificadas automaticamente como fabricação. O PCM pode marcar uma demanda já concluída para instalação, sem precisar reabrir ou editar todo o registro. Encerrar uma demanda também encerra seu serviço ativo na agenda; cancelar a demanda cancela as etapas ativas; reabrir cancela a instalação que ainda não foi realizada. O serviço da demanda reaberta pode voltar à programação, preservando as versões anteriores nos logs.

Datas sem realização após o dia previsto recebem a indicação **Prazo vencido**. O sistema registra e comunica a programação; a gestão confirma a realização pelo aplicativo.

## Acesso e avisos

- Gestão da programação: permissões existentes `pcm` / `pcm_manage` (admin, encarregado de manutenção e supervisor).
- Consulta: `/pcm/agenda`, por `agenda_servicos_view`, para os perfis cadastrados, exceto **encarregado de frigorífico** e **encarregado de logística**. Inclui mecânicos, produção, diretoria e almoxarifado.
- A consulta mostra apenas os campos da agenda das demandas: título, etapa, equipamento, responsável, local, datas e preparação. Não concede acesso ao restante do PCM, às OS ou aos detalhes privados das demandas.
- Avisos individuais usam `notificacoes.origem_tipo = 'PCM_AGENDA'`. Há um acesso **Agenda** no topo do aplicativo e um atalho no menu. O usuário marca apenas seus próprios avisos como lidos; notificações de chat de OS permanecem independentes.
- Destinatários devem estar ativos e sem arquivamento. Uma alteração real gera uma nova versão e um aviso por usuário; reenviar os mesmos dados não duplica avisos.
- Os avisos são internos. Preparação de materiais é uma orientação à equipe; não gera compras, reservas ou baixas de estoque automaticamente.

## Persistência e compatibilidade

Migration aditiva `247_pcm_agenda_demandas.js`:

- `demandas.requer_instalacao`, inicialmente desabilitada;
- `pcm_programacao_demandas`, com vínculo à demanda, etapa, programação, situação, data realizada, autoria e versão;
- índice exclusivo dos avisos por destinatário, evento e versão.

A tabela existente `pcm_programacao_semanal`, ligada às OS, permanece em uso. Não há alteração de migrations históricas nem preenchimento presumido de instalações existentes. As operações de agenda, logs e avisos são transacionais. Demandas com histórico de agenda são preservadas contra exclusão. Reprogramações mantêm o evento corrente e registram os dados de cada versão nos logs da demanda.

## Refinamento das telas do PCM

Nesta entrega, um estilo comum melhora cabeçalhos, hierarquia do texto, navegação, espaçamento, cartões, formulários, tabelas e foco de teclado. Cobre visão geral, plano mestre, agenda, preventivas, lubrificação, correias, engenharia, falhas, peças críticas, ferramental e relatórios. Os formulários auxiliares de preventivas e os roteiros de inspeção mantêm a mesma navegação e linguagem visual. No celular, a navegação e as tabelas largas têm rolagem contida; a agenda usa cartões por dia e formulários em uma coluna.

Para uma remodelação estrutural posterior, a direção é organizar o PCM por tarefa:

| Área | Telas e propósito |
| --- | --- |
| Hoje | Visão geral com pendências que exigem decisão e acessos diretos à agenda |
| Planejar | Demandas, agenda de serviços, plano mestre e capacidade da equipe |
| Prevenir | Preventivas, roteiros de inspeção, lubrificação e correias |
| Engenharia | Criticidade, falhas e confiabilidade |
| Recursos | Peças críticas e ferramental |
| Resultados | Relatórios e indicadores com origem e período claros |

Essa reorganização poderá reduzir a quantidade de opções expostas de uma vez, mantendo URLs e permissões. O próximo refinamento de cada tela deve priorizar uma ação principal, resumo curto, filtros úteis e detalhes progressivos, preservando seus fluxos operacionais.

## Validação

`tests/pcm-agenda-demandas.integration.test.js` cobre migração, fabricação/instalação, reprogramação, idempotência, permissões, exclusão de destinatários, isolamento de leitura, datas, rollback e coexistência com as OS. Complemente com as regressões de PCM, demandas, preventivas e Meu Portal e com `npm test`. Verifique as telas em desktop e celular antes da publicação.
