# Diagnóstico técnico e arquitetura mobile (Android primeiro, iOS-ready)

## 1) Estado atual identificado no código

### Stack e execução
- Backend Node.js + Express + EJS com sessões em SQLite (`better-sqlite3-session-store`) e deploy no Railway.
- Renderização server-side; clientes web consomem o mesmo backend (sem API separada para todo o sistema).
- Uploads via `multer`, mantendo arquivos em volume persistente (Railway).

### Mobile/UX atual
- Existe layout responsivo global (`public/css/app.css`) com breakpoints principais em `980px` e `640px`.
- Sidebar já possui comportamento de abertura móvel (`public/js/app-layout.js`).
- Login já tem viewport e adaptação em CSS interno (`views/auth/login.ejs`).
- Telas críticas (OS, equipamentos, compras, colaboradores) usam `multipart/form-data` e inputs `accept="image/*"`.

### PWA e service workers
- Havia **dois service workers** em paralelo: `public/sw.js` e `public/service-worker.js`.
- Também havia **duas estratégias de cliente push** (`public/js/push.js` e `public/js/push-client.js`) registrando SW diferentes.
- Não havia `manifest.webmanifest` padronizado.

### Push atual
- Push web está implementado com VAPID (`web-push`) em `/push`.
- Persistência existente para inscrições/prefs/logs (`push_subscriptions`, `push_preferences`, `push_notification_logs`).
- Fluxos de OS já disparam notificações web em pontos críticos.
- Ainda sem camada consolidada para token nativo de dispositivo (FCM).

## 2) Pontos fortes para virar app
- Backend central já está pronto e operacional (evita reescrita).
- Fluxo de autenticação por sessão já está funcional.
- Grande parte da responsividade já existe.
- Push web já possui base de negócio (eventos, preferências, logs), reutilizável para FCM.

## 3) Gargalos e riscos
- Conflito potencial por múltiplos service workers.
- Sem manifest PWA completo.
- Sem registro de tokens de dispositivo nativo.
- Dependência de cookies/sessão exige cuidado com WebView + domínio HTTPS do Railway.
- Ausência de credenciais Firebase impede envio FCM real até configuração externa.

## 4) Arquitetura adotada

### 4.1 Padrão geral
- **Backend único** permanece no Railway.
- **Cliente web** continua funcionando normalmente.
- **App Android (Capacitor)** atua como casca nativa carregando o backend remoto (modo `server.url`).
- iOS futuro previsto pela mesma base Capacitor + FCM/APNs.

### 4.2 Push em dois níveis
1. **Web Push (VAPID)** mantido para navegador/PWA.
2. **Push nativo (FCM)** preparado com:
   - armazenamento de tokens por usuário/dispositivo;
   - associação token ↔ usuário autenticado;
   - revogação de token;
   - envio híbrido (web push + FCM quando disponível);
   - deep link no payload (`deepLink`).

### 4.3 Service worker consolidado
- `service-worker.js` tornou-se SW principal (cache + push + click handling).
- `sw.js` virou compatibilidade (`importScripts('/service-worker.js')`) para não quebrar instalações antigas.

### 4.4 Capacitor (Android primeiro)
- Configuração criada para modo remoto (`capacitor.config.ts`).
- Plugins previstos para push e abertura por deep link (`@capacitor/push-notifications`, `@capacitor/app`).
- Bridge web adicionada (`public/js/mobile-bridge.js`) para:
  - registrar token nativo no backend;
  - tratar abertura por notificação/deep link.

## 5) Diferença: push web vs push nativo FCM
- **Web push**: depende de Service Worker + Push API + suporte do navegador.
- **FCM nativo**: token por app/dispositivo, entrega mais consistente em Android e controle de canais nativos.
- Estratégia híbrida melhora confiabilidade operacional: web onde houver browser, FCM dentro do app instalado.

## 6) Sessão/cookies e segurança
- Mantido `express-session` com cookie `httpOnly`, `sameSite=lax`, `secure=auto`.
- Adicionados headers básicos (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`).
- Como o app carrega URL HTTPS do Railway, sessão continua centralizada no backend.

## 7) SQLite com crescimento mobile
- Mantido SQLite para fase atual (menor atrito e custo).
- Limitações esperadas com crescimento:
  - concorrência elevada de escrita;
  - tuning e manutenção mais sensíveis sob pico;
  - replicação horizontal limitada.
- Recomendação futura: migrar para PostgreSQL quando houver aumento de usuários simultâneos, picos de escrita e necessidade de observabilidade mais avançada.

## 8) Fases práticas

### Fase 1 (concluída neste pacote)
- Ajustes base mobile/PWA/SW e preparação push híbrido.

### Fase 2 (parcialmente preparada)
- Base Capacitor e Android configuradas em código.
- Dependente de instalação de dependências + Android SDK para gerar projeto nativo final.

### Fase 3 (preparada conceitualmente)
- Estrutura compartilhável para iOS.
- Pendente: ambiente macOS/Xcode + conta Apple Developer + APNs/FCM iOS.

## 9) Pendências externas (não-code)
- Credenciais Firebase (service account + `google-services.json`).
- Android SDK/Android Studio para build e publicação.
- Acesso ao npm registry para instalar dependências Capacitor no ambiente de CI/servidor.

