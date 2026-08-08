# Diagnóstico técnico completo (revisado) — Manutenção Campo do Gado V2

**Data da revisão:** 2026-04-18
**Escopo:** Fase 1 (diagnóstico detalhado + plano de execução técnico)
**Objetivo:** preparar transformação do sistema atual em app Android profissional (com base pronta para iOS), sem reescrever backend e sem quebrar operação web no Railway.

---

## Resumo executivo

O sistema **já tem base sólida** para evolução incremental: backend monolítico organizado por módulos de negócio, sessões persistentes em SQLite, upload estável com Multer, push web já implantado e várias telas com responsividade parcial.

Os principais bloqueios para mobile profissional não são de domínio, e sim de **consolidação técnica**:

1. **Duplicidade de service workers** (`/sw.js` e `/service-worker.js`).
2. **Duplicidade de clientes de push** (`push.js` e `push-client.js`).
3. **Ausência de manifesto PWA institucional completo** e ativos padronizados (ícones 192/512).
4. **UX mobile inconsistente** nos fluxos críticos (alguns módulos já em cards, outros ainda desktop-first).

Com correções em ondas (P0/P1/P2), é viável entregar:
- Web mobile otimizado (zero zoom),
- App Android via Capacitor,
- Notificações nativas com FCM,
- Base pronta para iOS futuro.

---

## 1) Estrutura atual do sistema

### 1.1 Stack e execução
- Node.js + Express + EJS (`ejs-mate`).
- `server.js` inicializa migrations/seeds, middlewares e módulos por domínio.
- Sessões em SQLite com `better-sqlite3-session-store`.
- Upload de arquivos com Multer.
- Deploy em Railway (compatível com volume persistente para banco/uploads).

### 1.2 Organização modular (forte)
O código está dividido por contexto (`auth`, `dashboard`, `os`, `preventivas`, `compras`, `almoxarifado`, `estoque`, etc.), facilitando evoluções localizadas sem regressão ampla.

### 1.3 Persistência
- SQLite com histórico extenso de migrations.
- Há estrutura de push já modelada (assinaturas, preferências, logs).

---

## 2) Como o mobile funciona hoje

### 2.1 O que já ajuda
- Layout principal com viewport móvel e CSS responsivo.
- Sidebar com toggle para mobile e desktop.
- Módulos como OS e Preventivas já possuem padrão “table desktop + cards mobile” em partes da UI.
- Formulário de nova OS já tem upload de imagens e apoio por áudio/transcrição.

### 2.2 O que ainda limita
- Não existe uma “camada app” (Capacitor) configurada.
- Não há manifesto PWA completo institucional.
- Existem trechos desktop-first que exigem scroll horizontal em telas menores.
- Ausência de guideline único de ergonomia mobile (touch target, spacing, densidade).

---

## 3) Pontos fortes para virar app sem reconstrução

1. **Domínio já maduro e rodando em produção real**.
2. **Backend reaproveitável** (rotas, RBAC, sessão, uploads).
3. **Estrutura de push e eventos de negócio existente**.
4. **Arquitetura por módulos**, reduzindo risco de mudanças por fase.
5. **Railway já operacional**, mantendo infra atual.

---

## 4) Problemas atuais (diagnóstico objetivo)

### 4.1 PWA / SW / Push
- SW A: `public/sw.js` (foco principal em push + click).
- SW B: `public/service-worker.js` (cache/fetch + push com ações).
- Cliente push A: `public/js/push.js` registra `/sw.js`.
- Cliente push B: `public/js/push-client.js` registra `/service-worker.js`.

**Impacto:** comportamento inconsistente por dispositivo/navegador e maior risco de bugs intermitentes.

### 4.2 Manifesto/instalação
- Não há `manifest.json` completo com branding institucional e ícones oficiais.

### 4.3 UX operacional mobile
- Fluxos críticos heterogêneos (alguns muito bons para mobile, outros ainda densos em tabela).

### 4.4 Notificação nativa
- Base atual em Web Push/VAPID é funcional para web, mas não substitui FCM nativo para app Android profissional em confiabilidade e governança de canais.

---

## 5) Gargalos técnicos por criticidade

### P0 (bloqueia qualidade da base mobile)
1. Unificação de Service Worker.
2. Unificação de cliente push front-end.
3. Manifesto PWA completo (nome, short_name, ícones, theme/background).

### P1 (bloqueia qualidade operacional em campo)
1. Padronização de UX mobile dos fluxos críticos.
2. Ajustes de upload/câmera com feedback robusto em rede instável.
3. Definição de estratégia de sessão/cookies para WebView (Capacitor).

### P2 (escala e evolução)
1. FCM com tokens por dispositivo e canais por criticidade.
2. Plano de migração SQLite → PostgreSQL por gatilhos objetivos.
3. Play Store checklist e base iOS-ready.

---

## 6) Riscos para Android/iOS

1. **Conflito SW**: notificações/caching não determinísticos.
2. **Experiência inconsistente em campo**: telas com usabilidade desigual.
3. **Dependência de Web Push no app**: menor confiabilidade que FCM nativo.
4. **Sessão em WebView**: precisa validação real de cookies/expiração/reabertura.
5. **Escala de dados**: SQLite pode virar gargalo com crescimento e integrações de notificação/eventos.

---

## 7) Estado atual do push (as-is)

### Backend (bom nível)
- Endpoints para subscribe/unsubscribe/preferências/estatísticas/testes.
- Serviço com eventos de negócio (nova OS, mudança status, preventiva atrasada, emergência).
- Repositório persistindo assinaturas e logs.

### Front-end (problema estrutural)
- Duas implementações concorrentes disputando registro de SW e ciclo de inscrição.

### Veredito
- Push web está funcional, porém com dívida técnica de consolidação.

---

## 8) Estado atual do service worker (as-is)

### `public/sw.js`
- Bom para notificação/pós-clique e sinalização de áudio.
- Não cobre estratégia de cache offline.

### `public/service-worker.js`
- Possui estratégia de cache/fetch e regras por criticidade.
- Lista assets estáticos com risco de desatualização.

### Veredito
- Duas fontes de verdade = risco elevado. Deve existir **um único SW** com responsabilidades claras.

---

## 9) Duplicidades confirmadas

- `public/sw.js` **vs** `public/service-worker.js`
- `public/js/push.js` **vs** `public/js/push-client.js`

**Ação mandatória:** unificar ambos antes da etapa Capacitor/FCM para reduzir regressão.

---

## 10) Fluxos críticos para app (avaliados)

| Fluxo | Situação atual | Risco mobile | Ação recomendada |
|---|---|---|---|
| Login | Estável com sessão regenerada | Baixo | Validar cookie/sessão em WebView |
| Dashboard | Estruturado, com dados operacionais | Médio | Otimizar densidade mobile/performance |
| Abertura de OS | Forte (form + upload + áudio) | Médio | Melhorar ergonomia e captura por câmera |
| Fechamento de OS | Suportado por rotas/upload | Médio | Reduzir passos e reforçar feedback de envio |
| Upload de imagens | Estável com Multer | Médio | Testes reais Android (permissão/rede) |
| Preventivas | Parcialmente mobile-friendly | Médio | Padronizar cards e ações rápidas |
| Recebimento almox | Funcional porém tabela-heavy | Médio/Alto | Redesenhar lista/conferência mobile-first |

---

## Plano de execução revisado (sem ruptura)

## Fase 1 — Foundation técnica (P0)
1. Unificar SW em `public/service-worker.js` (ou nome definitivo único).
2. Unificar cliente push front-end (remover paralelismo de `push.js` e `push-client.js`).
3. Criar `public/manifest.json` completo com:
   - `name`: **Manutenção Campo do Gado**
   - `short_name`: **Manutenção**
   - `display`: `standalone`
   - `theme_color`: verde institucional
   - `background_color`: branco
   - ícones 192 e 512.

## Fase 2 — UX mobile operacional (P0/P1)
1. Padronizar botões grandes (mínimo 44px de altura).
2. Padronizar formulários e ações de fim de fluxo (salvar, concluir, fechar).
3. Converter telas table-heavy críticas para padrão híbrido (desktop table / mobile cards).
4. Ajustar sidebar e hierarquia visual para uso com uma mão.

## Fase 3 — Android via Capacitor (P1)
1. Adicionar Capacitor sem alterar backend.
2. Configurar `appId`, `appName`, `webDir`, deep links e permissões.
3. Validar sessão/cookies, upload de imagem/câmera, navegação interna e performance.

## Fase 4 — FCM profissional (P1)
1. Adicionar camada `device_tokens` no backend (por usuário/dispositivo/plataforma).
2. Criar endpoints de registrar/remover token.
3. Migrar eventos críticos para FCM com payload padrão:
   - título, mensagem, tipo, criticidade, deep link.
4. Canais por criticidade e badge.

## Fase 5 — iOS-ready + hardening backend (P2)
1. Manter abstração multiplataforma de notificação.
2. Documentar passos Xcode/Apple Developer/APNs.
3. Revisar segurança de sessão/cookies/headers/upload.
4. Definir gatilhos de migração SQLite → PostgreSQL (sem executar agora).

## Fase 6 — Play Store readiness (P2)
1. Definir package name final.
2. Pipeline de APK/AAB assinado.
3. Checklist de permissões e política de privacidade.
4. Guia de publicação e rollback.

---

## Critérios de aceite do diagnóstico

Este diagnóstico só é considerado concluído quando for possível responder “sim” para:

1. Sabemos exatamente os pontos de duplicidade e o impacto? **Sim**.
2. Existe ordem de execução por risco/valor? **Sim**.
3. O plano mantém backend atual e Railway? **Sim**.
4. Existe trilha clara até Android + FCM + iOS-ready? **Sim**.

---

## Conclusão final

A transformação para app mobile profissional é **totalmente viável sem reconstrução**.
O caminho recomendado é: **consolidar base PWA/push (P0) → padronizar UX mobile crítica (P0/P1) → Capacitor Android (P1) → FCM nativo (P1) → iOS-ready + hardening (P2)**.

Com essa sequência, o sistema segue em produção web no Railway durante toda a evolução, com risco controlado e ganho incremental real para operação de campo.
