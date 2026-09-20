# Administração e Usuários

## Caminho canônico

A gestão de acessos do sistema usa o módulo `/usuarios`:

- `GET /usuarios` — listagem e filtros;
- `GET /usuarios/novo` — novo acesso;
- `POST /usuarios` — criação;
- `GET /usuarios/:id/editar` — edição;
- `POST /usuarios/:id` — atualização;
- `POST /usuarios/:id/reset-senha` — redefinição de senha;
- `POST /usuarios/:id/excluir` — remoção/arquivamento;
- `POST /usuarios/:id/restaurar` — restauração.

O router é montado em `/usuarios` pelo `server.js`. Caminhos históricos que repetem
`/usuarios` dentro do próprio router continuam aceitos pelo mesmo handler para
compatibilidade, mas não devem ser usados em novos links.

## Permissões

`ACCESS.usuarios` permanece restrito a `ADMIN`.
Exclusão e restauração continuam protegidas por `requireAdmin`.

## Preservação de histórico

A remoção de usuário continua usando `usuarios-lifecycle.js`:

- usuário sem vínculos históricos pode ser apagado;
- usuário com vínculos é arquivado;
- o cadastro arquivado pode ser restaurado;
- o próprio usuário não pode remover a si mesmo.

Não substituir esse fluxo por `DELETE FROM users` direto.

## Views legadas removidas

Foram removidas apenas views sem controller/rota ativa:

- `views/admin/users.ejs`;
- `views/usuarios/new.ejs`;
- `views/admin/whatsapp-status.ejs`.

A view canônica de novo usuário é `views/usuarios/novo.ejs`.

## Administração técnica

As telas `/admin/armazenamento` e `/admin/limpeza-volume` usam o console
administrativo compartilhado. Operações destrutivas continuam com confirmação e
permissões originais; a limpeza de volume preserva PDFs, textos e SQLite.
