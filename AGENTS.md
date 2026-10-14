# AGENTS.md — Manutenção Campo do Gado V2

## Escopo
Este repositório é o sistema **Manutenção Campo do Gado V2**. Preserve o comportamento existente e faça mudanças incrementais, pequenas e verificáveis.

## Regra de economia de contexto
- Comece pela tarefa e pelos caminhos citados nela.
- Se o módulo já for conhecido, pesquise apenas nele e nos testes relacionados.
- Não faça varredura recursiva do repositório inteiro por padrão.
- Consulte `config/routes.js` e `docs/ARQUITETURA.md` antes de inventar novas rotas, aliases ou namespaces.
- Use a Skill `campo-do-gado-maintenance` para alterações funcionais neste projeto.
- Só consulte documentação externa quando o comportamento depender de API/biblioteca atual ou quando o código local não responder.
- Para assuntos OpenAI/Codex/API, prefira o OpenAI Developer Docs MCP em vez de pesquisa web ampla.

## Arquitetura e dados
- Stack principal: Node.js + Express + EJS + SQLite (`better-sqlite3`).
- Entrada: `server.js`.
- Domínios ficam principalmente em `modules/<dominio>/`.
- Views ficam em `views/`; assets em `public/`; configuração em `config/`.
- Banco e migrations ficam em `database/`.
- Nunca edite migration histórica já aplicada. Se schema precisar mudar, crie migration nova e não destrutiva.
- Preserve RBAC existente; não amplie permissões sem requisito explícito.
- Não hardcode nomes de colaboradores, fornecedores, equipamentos ou usuários quando já existir fonte de dados.
- Não invente status, quantidades, custos ou relacionamentos ausentes no banco.

## Mudanças
- Corrija causa-raiz; evite mascarar divergência somente na view.
- Reutilize serviços, tabelas, status e relações existentes antes de criar estruturas paralelas.
- Fluxos que alterem múltiplas entidades persistidas devem ser transacionais quando necessário.
- Evite N+1; prefira consultas agregadas quando a tela exigir visão operacional.
- Preserve compatibilidade legada documentada.

## Testes
- Primeiro rode os testes diretamente ligados ao módulo alterado.
- Para alteração funcional, rode `npm test` antes de considerar concluído, salvo limitação objetiva do ambiente; nesse caso, informe exatamente o que não pôde ser executado.
- Para mudanças somente de documentação/instruções, testes de runtime não são obrigatórios.
- Não declare sucesso sem verificar o diff e os testes aplicáveis.

## Segurança operacional
- Nunca grave segredos, tokens, chaves ou conteúdo de `.env`.
- Não execute operação destrutiva em produção, Railway ou banco persistente sem autorização explícita.
- Trabalhe em branch/PR quando disponível.

## Política permanente de merge automático (decisão do responsável — 14/10/2026)
- Para PRs que criarmos neste projeto com autorização do responsável, **todos os checks obrigatórios do CI aprovados no SHA atual = merge imediato, sem perguntar novamente**. Use preferencialmente squash merge em `main`.
- Verifique explicitamente a suíte completa e as regressões CAD Python Engine e Assistente Industrial, além de quaisquer checks obrigatórios futuros. Não considere sucesso apenas por um teste isolado; skipped/cancelled/pending/failure não equivalem a todos aprovados.
- Antes do merge, confirme diff, estado da PR, ausência de conflitos e nenhuma proibição expressa, falha de segurança, regra de proteção de branch ou bloqueio de aprovação. Se houver impedimento, corrija, repita a CI e integre quando estiver verde; reporte impeditivos reais.
- Se a PR estiver como draft e estiver pronta, marque como ready for review e faça o merge após os checks passarem. Evite solicitar aprovação repetida para o mesmo trabalho já autorizado.
- Após o merge, acompanhe o Railway e diferencie `merged` de `deployed` e `SUCCESS`; não declare publicação até a implantação do commit ser confirmada.
- **Observação técnica (14/10/2026):** `allow_auto_merge` do GitHub está desabilitado neste repositório. Portanto, esta política guia o comportamento dos agentes; o merge autônomo pelo GitHub, sem o agente ativo, exige habilitação posterior de Auto-merge e checks obrigatórios.
- Fonte oficial desta decisão: [Política no Notion](https://app.notion.com/p/3f97ddca327c8158abebea303379cc99?pvs=204).
## Entrega final
Informe de forma curta:
1. causa-raiz ou objetivo atendido;
2. arquivos alterados;
3. migrations criadas;
4. testes executados e resultado;
5. riscos ou pontos que exigem revisão humana.
