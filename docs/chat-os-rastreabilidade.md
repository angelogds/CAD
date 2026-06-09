# Chat de OS — Rastreabilidade por Ordem de Serviço

## Objetivo

O módulo **Chat de OS** transforma cada Ordem de Serviço em uma conversa oficial, semelhante ao modelo de WhatsApp, mas organizada por OS. A comunicação deixa de ficar dispersa em grupos externos e passa a compor o histórico rastreável da manutenção, inspeção, compras e almoxarifado.

## Fluxo operacional

1. **OS aberta ou em andamento** aparece na lista `/chat-os`.
2. **Justificativa de andamento** registrada na OS gera mensagem automática no chat.
3. Usuários autorizados enviam mensagens por setor: Manutenção, Inspeção, Compras ou Almoxarifado.
4. Quando houver falta de material, a partir da OS ou do chat é possível abrir uma **solicitação vinculada**.
5. Ao salvar a solicitação, o vínculo OS x Solicitação é gravado e uma mensagem automática é registrada no chat.
6. Compras atualiza dados/cotação/status da solicitação e o chat recebe a atualização.
7. A Inspeção usa o histórico no relatório e no PDF mensal, na seção **Histórico de Tratativas da OS**.

## Permissões

Permissões adicionadas em `config/rbac.js`:

- `os_chat_read`: ADMIN, MANUTENCAO_SUPERVISOR, ENCARREGADO_MANUTENCAO, MECANICO, COMPRAS, INSPECAO_QUALIDADE, DIRETORIA e ALMOXARIFADO.
- `os_chat_write`: perfis operacionais que podem responder, exceto DIRETORIA.
- `os_chat_manage`: ADMIN, MANUTENCAO_SUPERVISOR e ENCARREGADO_MANUTENCAO.

## Tabelas criadas

Migração: `database/migrations/160_os_chat_por_os.js`.

- `os_chat_mensagens`: histórico permanente de mensagens e eventos da OS.
- `os_chat_leituras`: controle de última mensagem lida por usuário e OS.
- `os_solicitacoes_vinculos`: vínculo entre OS e solicitação de material.
- `notificacoes`: criada somente se ainda não existir, para avisos do sino com `origem_tipo = 'OS_CHAT'`.

## Rotas

- `GET /chat-os`: lista de conversas por OS.
- `GET /chat-os/:osId`: conversa da OS.
- `POST /chat-os/:osId/mensagens`: envia mensagem.
- `POST /chat-os/:osId/lida`: marca conversa como lida.
- `GET /chat-os/api/nao-lidas`: contador para UI.
- `GET /chat-os/api/notificacoes`: notificações não lidas.

## Integrações implementadas

- Menu lateral com **Chat de OS**.
- Sino de notificações no topo do layout.
- Bloco **Conversa da OS** na tela de detalhe da OS.
- Seção **Rastreabilidade da OS** na tela de detalhe.
- Botão **💬 Conversa** e dados de última interação nos cards de OS em andamento da inspeção.
- Formulário de solicitação aceita `os_id` por query string e registra vínculo/mensagem automática ao criar.
- Tela de compras mostra vínculo com OS e links para OS/chat.
- Atualizações de compras registram mensagem automática no chat quando a solicitação está vinculada.
- PDF de inspeção inclui as últimas tratativas do chat em **Histórico de Tratativas da OS**.

## Como testar manualmente

1. Abrir uma OS.
2. Registrar motivo de andamento, por exemplo `Falta de material`.
3. Abrir `/chat-os` e confirmar que a OS aparece como conversa.
4. Entrar na conversa da OS e enviar mensagem pela manutenção.
5. Entrar com perfil inspeção e responder na mesma conversa.
6. Verificar contador e dropdown do sino no topo.
7. Clicar em **Criar solicitação vinculada** no chat ou na OS.
8. Salvar a solicitação com ao menos um item.
9. Confirmar mensagem automática no chat informando a solicitação vinculada.
10. Entrar em Compras e atualizar dados ou status da solicitação.
11. Confirmar nova mensagem automática no chat.
12. Abrir o PDF da inspeção e verificar a seção **Histórico de Tratativas da OS**.
13. Fechar a OS e confirmar que o histórico do chat permanece salvo.

## Observações técnicas

- O módulo não usa WebSocket nesta etapa; a tela de conversa faz atualização simples por recarregamento/polling de 30 segundos.
- Mensagens vazias são rejeitadas pelo service.
- Notificações não substituem o histórico: elas apenas avisam o usuário e apontam para `/chat-os/:osId`.
- A migration é idempotente e compatível com SQLite.
