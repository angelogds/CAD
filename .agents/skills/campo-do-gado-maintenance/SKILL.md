---
name: campo-do-gado-maintenance
description: Implementar, revisar ou corrigir funcionalidades do sistema Manutenção Campo do Gado V2 com pesquisa local direcionada, preservação de arquitetura, RBAC, SQLite e testes, evitando exploração desnecessária do repositório.
---

# Campo do Gado — fluxo de manutenção de código

Use este fluxo para mudanças funcionais no repositório.

## 1. Delimite antes de pesquisar
Leia a tarefa inteira e identifique:
- módulo principal;
- módulos vizinhos realmente afetados;
- rota/tela alvo;
- tabelas ou migrations envolvidas;
- testes já existentes com o mesmo nome de domínio.

Se o módulo estiver explícito, não comece pela raiz inteira.

## 2. Carregue só o contexto necessário
Consulte `references/project-map.md` e leia apenas as seções ligadas à tarefa.
Depois inspecione, nesta ordem:
1. `modules/<dominio>/*.routes.js`;
2. controller relevante;
3. service relevante;
4. view exata;
5. teste(s) do domínio;
6. migration/schema apenas se a mudança tocar dados.

Pare a exploração quando já houver evidência suficiente para implementar.

## 3. Regras de busca econômica
- Prefira buscas restritas por caminho, nome de rota, tabela, função ou texto exibido.
- Evite `find`/`rg` em todo o repositório quando já souber o domínio.
- Não releia arquivos grandes inteiros se um intervalo ou busca por símbolo bastar.
- Não consulte web para descobrir comportamento que o próprio código/teste já define.
- Para OpenAI/Codex/API atual, use o OpenAI Developer Docs MCP primeiro.

## 4. Implemente sem criar uma segunda arquitetura
- Reutilize status, helpers, serviços, RBAC e relações existentes.
- Não duplique fluxo somente para atender uma nova tela.
- Não edite migration antiga; adicione uma nova quando indispensável.
- Não hardcode pessoas ou dados operacionais.
- Preserve aliases/compatibilidade descritos em `docs/ARQUITETURA.md`.

## 5. Valide em camadas
1. teste específico do domínio;
2. testes vizinhos afetados;
3. `npm test` para mudança funcional;
4. revisão do diff para confirmar que não houve mudança fora do escopo.

Se um teste falhar por problema anterior e comprovadamente não relacionado, registre a evidência; não esconda a falha.

## 6. Trabalhos em lote
Para uma fila de tarefas:
- trate uma tarefa por vez;
- conclua implementação + testes + revisão antes da próxima;
- mantenha commits/PRs coerentes por objetivo;
- não interrompa por decisões triviais de implementação já cobertas por estas regras;
- pare e peça decisão somente quando houver risco de perda de dados, mudança de regra de negócio ambígua, credencial, produção ou requisito contraditório.

## 7. Relatório final
Resuma objetivo, arquivos, migration, testes e riscos. Não despeje logs completos.
