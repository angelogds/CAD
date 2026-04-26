# Arquitetura e Canonização de Rotas (Estabilização)

## Objetivo
Documento curto da fase de estabilização técnica para reduzir ambiguidade de rotas, manter compatibilidade legada e facilitar próximas refatorações.

## Rotas oficiais por módulo
- OS: `/os`
- Dashboard: `/dashboard`
- Modo TV: `/tv`
- IA (oficial): `/ai`
- Inspeção: `/inspecao`
- Compras: `/compras`
- Almoxarifado: `/almoxarifado`
- Estoque: `/estoque`
- PCM: `/pcm`

Fonte central: `config/routes.js`.

## Compatibilidade legada ativa
- `/ordens-servico/*` → `/os/*` (redirect 301 para GET/HEAD e 307 para demais métodos).
- Namespace antigo de inspeção permanece ativo por adapter de módulo:
  - `/inspection/*` reutiliza handlers de `/inspecao/*`.
- Namespace plural de traçagem permanece ativo por adapter de módulo:
  - `/tracagens/*` mantém endpoints legados e compatibilidade com `/tracagem/*`.
- Namespace `/ia/*` permanece ativo para endpoints legados de transcrição/análise curta;
  `/ai/*` segue como namespace oficial para o módulo completo.

## Duplicidades mapeadas (diagnóstico)
- Rotas/aliases: `/os` e `/ordens-servico`; `/ai` e `/ia`; `/inspecao` e `/inspection`; `/tracagem` e `/tracagens`.
- Views com naming duplicado: `new`, `novo`, `nova` em múltiplos módulos (ex.: OS, Usuários, Estoque, Compras/Solicitações).
- Módulos adapter intencionais:
  - `modules/inspection/*` reexporta `modules/inspecao/*`.

## Serviços grandes que exigem fatiamento posterior
- `modules/os/os.service.js` (~2300 linhas)
- `modules/preventivas/preventivas.service.js` (~1900 linhas)
- `modules/academia/academia.service.js` (~1700 linhas)

## Próxima etapa recomendada (sem quebra)
1. Criar adapters explícitos de view (`nova` -> `new`) por include/reexport antes de remover duplicadas.
2. Fatiar `os.service.js` em:
   - `os-create.service.js`
   - `os-assignment.service.js`
   - `os-close.service.js`
   - `os-media.service.js`
   - `os-notification.service.js`
   - `os-ranking.service.js`
3. Consolidar constantes de status/criticidade/permissões em arquivo único por domínio.
4. Expandir testes de regressão de alias e fluxo compras → almoxarifado → estoque.
