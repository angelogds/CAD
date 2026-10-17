# Graphify remoto — piloto do Campo do Gado V2

## Objetivo
Gerar um mapa de dependencias do codigo do repositório **sem executar a aplicacao**, sem tocar no SQLite de producao e sem alterar o deploy do Railway. A analise corre em um runner efemero do GitHub Actions.

## Como executar
1. Abra **GitHub > Actions > Graphify - mapa remoto (piloto)**.
2. Selecione **Run workflow** na branch `main` (apos a integracao do PR). Durante a revisao, a abertura deste PR ja dispara um teste.
3. Ao fim de uma execucao aprovada, abra a execucao e baixe **graphify-codigo-<run_id>**, na area *Artifacts*.
4. Extraia o ZIP e abra `graphify-out/graph.html` em um navegador (o JSON e o eventual relatorio ficam na mesma pasta).

## O que a rotina faz
- Instala `graphifyy==0.9.92` no runner, sem alterar `package.json` nem o Node.js.
- Executa `graphify extract . --code-only` (AST do codigo; documentos e midias nao sao enviados a modelos externos).
- Executa `graphify cluster-only . --no-label` e `graphify export html`.
- Verifica `graphify-out/graph.json` e `graphify-out/graph.html` e publica os resultados apenas como artefato da execucao por **7 dias**.

## Utilizacao com Codex na nuvem
O grafo nao aparece automaticamente em toda sessao do Codex. Para consultar em outra sessao, disponibilize o artefato extraido no workspace da sessao ou gere outro grafo no ambiente de trabalho:

```bash
python -m pip install graphifyy==0.9.92
graphify extract . --code-only
graphify cluster-only . --no-label
graphify export html
graphify query "quais modulos acessam o banco de dados?"
```

Com `graphify-out/graph.json` presente, consulte `graphify query`, `graphify explain` e `graphify path` para restringir a busca **antes** de expandir para outros arquivos. O codigo e os testes seguem sendo a fonte de verdade. Nao trate arestas inferidas como prova de comportamento.

## Limites e seguranca
- O workflow tem permissao GitHub `contents: read`; nao recebe segredos do Railway, chaves do banco nem credenciais externas.
- `--code-only` nao garante cobertura completa de views EJS, fluxo SQL dinamico e dependencias resolvidas em runtime. Essas relacoes exigem conferencia manual e testes.
- O artefato pode conter caminhos, simbolos e trechos de codigo do repositorio; nao compartilhe sem avaliar a confidencialidade.
- **Nao** fazer deploy, migration, alteracao de dados, merge automatico nem commit do grafo a partir deste job.
- O job produz um mapa de diagnostico, **nao** verifica corretude do sistema nem substitui `npm test` ou as regressões CAD/Assistente.
- Em caso de falha do Graphify, consulte o log do job antes de promover a integracao; nao marque o piloto como validado.

Documentacao oficial:
- https://docs.graphify.com/guides/local-development
- https://github.com/Graphify-Labs/graphify
