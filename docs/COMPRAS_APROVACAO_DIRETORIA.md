# Aprovação de compras configurável por perfil

O ADMIN controla a exigência em **Configurações do sistema → Configurações por perfil → Diretoria**, também disponível no menu Sistema. Rota: `/admin/configuracoes/perfis`.

- **Desativado — somente consulta:** Compras cota e marca como comprado sem aprovação digital. A Diretoria mantém o acesso aos dados e ao histórico, sem ações de aprovação.
- **Ativado — aprovação obrigatória:** itens ainda não comprados exigem aprovação digital válida de ADMIN/DIRETORIA. Alterações na cotação continuam invalidando a assinatura aprovada.
- Compras já efetivadas não são reabertas pela reativação. Recebimento, consenso com o solicitante, liberação do Planejamento da Demanda e permissões existentes continuam seguindo suas regras.

A migration `239_compras_diretoria_configuravel.js` registra inicialmente `compras_diretoria_aprovacao_obrigatoria=0` em `config_sistema`, conforme a contingência solicitada. É aditiva e idempotente: não altera itens, aprovações ou uma configuração já existente. Ausência de configuração ou erro de leitura mantém a aprovação obrigatória.

Cada alteração efetiva pelo ADMIN é gravada junto com o valor anterior, novo valor, usuário e horário em `config_sistema_historico`, na mesma transação. Reenvio do mesmo valor não duplica o histórico.

Validação: `node --test tests/compras-diretoria-configuravel.test.js tests/compras-recebimento-integral-historico.test.js` e `npm test`.
