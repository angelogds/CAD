# Diagnóstico arquitetural (server.js + package.json)

## Resumo executivo

O projeto está funcional e robusto para o estágio atual, mas já demonstra sinais de custo crescente de manutenção por três fatores principais:

1. **Bootstrap centralizado demais** no `server.js` (muita responsabilidade na entrada da aplicação).
2. **Convivência de rotas/nomes duplicados** (ex.: `inspection`/`inspecao`, `ai`/`ia`, `tracagem`/`tracagens`).
3. **Serviços com alta concentração de regra de negócio** (especialmente no domínio de OS).

A recomendação é um refactor incremental focado em **canonização de nomes e rotas**, **redução de aliases legados** e **fatiamento de serviços** sem reescrita do produto.

---

## Evidências rápidas no código

- `server.js` concentra configuração de ambiente, migrations, sessão, storage persistente, segurança de headers, helpers globais de view, health checks e montagem de módulos.
- `package.json` confirma perfil de aplicação monolítica Express + EJS + SQLite, com integrações mobile Capacitor e push notifications.
- A base já possui testes de regressão para rotas e módulos, o que favorece refatoração segura.

---

## Prioridades de execução

### P1 — Canonizar rotas e namespaces

Definir um caminho oficial por domínio e manter aliases apenas como compatibilidade temporária:

- `inspecao` **ou** `inspection` (escolher 1 canônico)
- `ai` **ou** `ia` (escolher 1 canônico)
- `tracagem` vs `tracagens` (eliminar ambiguidade semântica)

> Saída esperada: mapa de rotas canônicas + lista de aliases com data de remoção.

### P2 — Enxugar o bootstrap (`server.js`)

Mover responsabilidades para módulos dedicados:

- `app/bootstrap/session.js`
- `app/bootstrap/security.js`
- `app/bootstrap/views.js`
- `app/bootstrap/storage.js`
- `app/bootstrap/routes.js`

> Saída esperada: `server.js` apenas orquestrando inicialização.

### P3 — Padronização de nomenclatura

Definir convenção e aplicar gradualmente:

- idioma oficial para domínios (PT-BR ou EN)
- regra singular/plural
- padrão para `*.routes.js`, `*.controller.js`, `*.service.js`

> Saída esperada: guia curto de convenções + lint de nomenclatura em revisão de PR.

### P4 — Fatiar serviços de OS

Separar `os.service.js` em subserviços por responsabilidade:

- criação/triagem
- alocação
- execução/pausa
- fechamento
- anexos/mídia
- notificações
- ranking/indicadores

> Saída esperada: menor acoplamento e testes mais objetivos por caso de uso.

### P5 — Testes de compatibilidade antes de remover alias

Antes de limpar caminhos legados:

- garantir testes de redirect/compatibilidade para rotas antigas
- validar fluxos de mobile/push dependentes de caminhos históricos

> Saída esperada: refactor sem regressão de navegação e integração.

---

## Plano de 30 dias (incremental)

### Semana 1
- Inventário de rotas e aliases existentes.
- Decisão de nomes canônicos (`inspecao|inspection`, `ai|ia`, `tracagem|tracagens`).

### Semana 2
- Introdução dos módulos de bootstrap.
- Migração inicial do `server.js` sem alterar comportamento externo.

### Semana 3
- Primeiro fatiamento do domínio de OS (1 ou 2 subserviços).
- Adição de testes de contrato para rotas críticas.

### Semana 4
- Desativação progressiva de aliases menos usados.
- Documentação de depreciação e monitoramento de erros 404/redirect.

---

## Métricas de sucesso

- Redução de mounts/aliases diretos no `server.js`.
- Queda de arquivos com nomes ambíguos por domínio.
- Menor tamanho médio dos serviços de domínio crítico (OS).
- Cobertura de rotas críticas e compatibilidade legada mantida.

---

## Observações finais

A arquitetura atual já suporta operação real com bom nível de recursos (TV mode, push/mobile, IA e PCM). O risco principal é de **coerência arquitetural ao longo do tempo**, não de falta de funcionalidade. Por isso, a melhor estratégia é **evolução incremental com contratos de compatibilidade**, em vez de reescrita.
