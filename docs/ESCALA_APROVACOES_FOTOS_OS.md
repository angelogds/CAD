# Escala: aprovações na central, fotos e seleção de OS

## Aprovação de folgas no painel

A central `/escala` agora mostra **Aprovação de folgas** após os acessos rápidos para os perfis já autorizados em `escala_manage`. Exibe o total de pendências e até seis pedidos com funcionário, data, consumo, saldo e motivo. O link **Ver todas as solicitações** leva à tela de Folgas. Sem pedidos, o bloco continua visível com estado vazio.

Os formulários são compartilhados com `/escala/folgas` pelo partial `_aprovacoes-folgas.ejs`. Aprovar e reprovar usam os endpoints e o serviço de decisão existentes. O saldo, a disponibilidade, o bloqueio de segunda-feira e a autorização excepcional continuam sendo revalidados no servidor. Reprovação exige motivo. A decisão registra o perfil da sessão; o funcionário recebe a notificação pelo fluxo já existente.

Depois de uma ação iniciada na central, o usuário retorna a `/escala#aprovacoes-folgas`. O destino é permitido explicitamente; valores externos em `voltar_para` são ignorados. Os demais perfis não recebem a fila no modelo do painel. Funcionários excluídos da Escala ficam fora da contagem e da lista, usando o filtro de retenção existente.

## Ordem de serviço

O campo mantém o `select[name=os_id]` e sua validação no serviço. O JavaScript aprimora a apresentação com um painel no fluxo do formulário, sempre abaixo do campo: pesquisa por número, equipamento ou descrição, rolagem interna e opções que respeitam a largura disponível. A seleção funciona com clique, teclado, Enter e Escape. “Sem OS” mantém a exigência de descrição. O identificador selecionado continua sendo enviado pelo campo original.

O fallback nativo continua no HTML. A consulta de opções também passa a excluir as variantes terminais FINALIZADA/FINALIZADO e CANCELADO, além das já excluídas. O limite existente de 200 opções é preservado; não há nova API nem alteração no fluxo de início da hora extra.

## Fotos

O partial `_foto-hora-extra.ejs` atende início e conclusão. O botão **Adicionar foto** abre o seletor nativo/câmera; o nome do arquivo aparece ao lado e é possível trocar ou remover antes de enviar. Os campos `foto_inicio`/`foto_fim`, envio multipart e captura de câmera são preservados. Fotos continuam opcionais. A apresentação não altera o bloqueio por localização nem a regra da hora extra das 17h.

## Verificação

Testes cobrem a visibilidade por perfil, contagem de pendências, exclusão de funcionários fora da Escala, indicação de conflito, destino interno e validação recusada sem notificação de aprovação. QA com servidor e SQLite isolados valida aprovação, reprovação com motivo, exceção da segunda folga, débito e auditoria, restrição do mecânico, estado vazio, seletor abaixo do campo com busca e teclado, fotos persistidas no início/fim e GPS em 390/1440px. Nenhuma folga real é aprovada durante os testes.

Não há migration: os dados e regras existentes são reutilizados.
