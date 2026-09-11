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
