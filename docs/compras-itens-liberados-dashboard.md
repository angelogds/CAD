# Painel de Compras — itens liberados pela Diretoria

Esta melhoria sinaliza, na fila principal de Compras, itens que já possuem aprovação digital válida da Diretoria e ainda não foram efetivados como comprados.

## Regra

- `APROVADA`: item liberado para compra.
- `AGUARDANDO_APROVACAO`: item ainda aguardando Diretoria.
- `COMPRADO`: deixa de ser considerado liberado pendente porque a ação de compra já foi concluída.
- Aprovação com assinatura inválida/desatualizada não é tratada como liberada.

## Interface

Cada solicitação exibida no painel recebe uma indicação individual:

- `X itens liberados para compra`;
- `X itens aguardando Diretoria`; ou
- `Sem itens liberados no momento`.

Solicitações com itens liberados recebem destaque verde suave e o botão principal passa a orientar a ação de compra.

O painel também cria um indicador `LIBERADOS P/ COMPRA` e um alerta operacional com atalho para os itens liberados atualmente exibidos.

A sinalização reutiliza o endpoint de aprovação por item já existente e não cria novos status, tabelas ou migrations.


## Semáforo visual da fila

A fila operacional também diferencia solicitações que ainda não iniciaram cotação:

- **vermelho suave:** solicitação em `ABERTA` ou `REABERTA`; indica que ainda precisa entrar em cotação;
- **verde suave:** existe item efetivamente liberado pela Diretoria e aguardando compra;
- **sem destaque de pendência:** a solicitação já avançou para `EM_COTACAO` ou outra etapa posterior.

O verde de liberação para compra tem prioridade visual sobre o vermelho de abertura. A regra é derivada do status atual, portanto vale automaticamente para solicitações antigas ainda abertas e para novas solicitações que chegarem à fila. Nenhum status é alterado apenas por causa da sinalização visual.
