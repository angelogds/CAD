# Skills do CAD

As skills existentes `campo-do-gado-maintenance`, `apple-design` e
`caldeira-cavaco` são mantidas com suas instruções próprias.

## Matt Pocock

Este repositório contém as 27 skills oficiais declaradas pelo plugin
[`mattpocock-skills`](https://github.com/mattpocock/skills), versão **1.3.1**.
Cada pasta contém seu `SKILL.md` e os arquivos de apoio originais. Elas ficam
disponíveis para descoberta pelo Codex em `.agents/skills/` em novos checkouts,
sem depender do cache pessoal de plugins.

| Uso | Skills |
| --- | --- |
| Escolher um fluxo e configurar o projeto | `ask-matt`, `setup-matt-pocock-skills` |
| Diagnóstico e pesquisa | `diagnosing-bugs`, `research`, `triage` |
| Planejamento | `grill-with-docs`, `to-spec`, `to-tickets`, `wayfinder` |
| Implementação e testes | `implement`, `implement-spec`, `tdd`, `prototype` |
| Arquitetura e domínio | `domain-modeling`, `codebase-design`, `improve-codebase-architecture` |
| Revisão e entrega | `code-review`, `pr`, `retro`, `wizard` |
| Comunicação e aprendizado | `grill-me`, `grilling`, `handoff`, `teach`, `to-questionnaire`, `wait-what`, `writing-for-agents` |

Use a skill adequada ao pedido, mantendo as regras específicas do CAD descritas
no `AGENTS.md`. A instalação copia os arquivos e não executa os fluxos,
scripts, configuração de issue tracker ou criação de labels descritos neles.

A origem, versão, commit do marketplace e lista de skills estão em
[`mattpocock-source.json`](./mattpocock-source.json). A licença MIT original foi
preservada em [`MATTPOCOCK-LICENSE`](./MATTPOCOCK-LICENSE).

Esta é uma cópia versionada no projeto: atualizações devem ser revisadas e
feitas por PR. Skills experimentais, descontinuadas e extras fora do manifesto
oficial do plugin não foram incluídas. O plugin instalado no ambiente continua
sendo uma instalação separada; para evitar skills duplicadas em outro cliente,
escolha usar o plugin global ou as cópias locais conforme a descoberta desse
cliente.
