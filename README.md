# Manutenção Campo do Gado — V2

Sistema V2 modular para gestão de manutenção e rotinas operacionais do **Campo do Gado – Indústria de Reciclagem Animal LTDA**.

Este repositório segue um padrão rígido para acelerar evolução sem retrabalho:
- módulos independentes (`routes/controller/service`)
- migrations/seed padronizados
- RBAC por `role`
- UI com EJS (layout + parciais)
- SQLite (better-sqlite3)

> **Regra de ouro:** qualquer alteração/feature deve seguir o `CODING_RULES.md`.

---

## Tecnologias
- Node.js + Express
- EJS + ejs-mate
- SQLite (`better-sqlite3`)
- Sessão: `express-session` + `connect-flash`

---

## Como rodar localmente

### 1) Instalar dependências
```bash
npm install

### 2) Rodar migrations e seed
```bash
npm run migrate
npm run seed
```

### 3) Subir aplicação
```bash
npm run dev
```

## Novo módulo: Desenho Técnico

### Rotas principais
- `GET /desenho-tecnico` — lista de desenhos
- `GET /desenho-tecnico/dashboard` — visão geral do módulo
- `GET /desenho-tecnico/novo` — criação de novo desenho
- `POST /desenho-tecnico` — salvar desenho
- `GET /desenho-tecnico/:id` — visualizar desenho
- `GET /desenho-tecnico/:id/editar` — editar desenho
- `POST /desenho-tecnico/:id` — atualizar desenho
- `POST /desenho-tecnico/:id/duplicar` — duplicar desenho
- `GET /desenho-tecnico/:id/svg` — gerar SVG técnico
- `POST /desenho-tecnico/:id/pdf` — gerar PDF técnico
- `POST /desenho-tecnico/:id/vincular` — vincular desenho em equipamento
- `GET /desenho-tecnico/:id/revisoes` — histórico de revisões
- `GET /desenho-tecnico/biblioteca` — biblioteca técnica

### Railway (deploy com 1 Volume persistente)
1. Criar **1 Volume** no projeto Railway.
2. Anexar o Volume ao serviço **CAD**.
3. Definir o mount path do Volume como **`/data`**.
4. Configurar variáveis de ambiente no serviço:
   - `DATA_DIR=/data`
   - `UPLOAD_DIR=/data/uploads`
   - `PDF_DIR=/data/pdfs`
   - `IMAGE_DIR=/data/imagens`
   - `TEMP_DIR=/data/temp`
   - `SQLITE_DIR=/data/sqlite`
   - `DB_PATH=/data/sqlite/app.db`
5. Start command recomendado:
   ```bash
   npm ci && npm run migrate && npm start
   ```
6. Validar persistência:
   - enviar arquivo em upload;
   - gerar PDF;
   - reiniciar/redeploy e confirmar que os arquivos continuam acessíveis.

## Desenho Técnico – Fase 2

A Fase 2 do módulo **Desenho Técnico** adiciona uma base de mini CAD industrial com:

- Camadas técnicas (`geometria_principal`, `linhas_de_centro`, `cotas`, `textos`, `furos`, `construcao`, `solda`, `observacoes`, `planificacao`).
- Biblioteca de **Blocos Técnicos** com duplicação e inserção por instância.
- Cotas avançadas: cadeia, baseline, angular, raio, diâmetro, entre centros e padrão de furação.
- Integração direta com Traçagem para gerar/abrir desenho técnico automaticamente.

### Novas rotas

- `POST /desenho-tecnico/integrar/tracagem`
- `POST /desenho-tecnico/gerar-a-partir-da-tracagem/:origem/:id`
- `GET /desenho-tecnico/abrir-de-tracagem/:origem/:id`
- `POST /desenho-tecnico/:id/camadas`
- `POST /desenho-tecnico/:id/camadas/:camadaId`
- `POST /desenho-tecnico/:id/blocos/inserir`
- `POST /desenho-tecnico/:id/cotas`

### Teste local rápido

1. Suba a aplicação normalmente (`npm start`).
2. Crie/abra um desenho e valide os painéis de Camadas, Blocos e Cotas.
3. Em Traçagem, abra uma peça suportada e use **Gerar desenho técnico**.
4. Gere PDF técnico e confirme renderização de camadas visíveis e cotas.

### Railway

- Mantida compatibilidade com execução padrão no Railway (Node + SQLite).
- Migrations incrementais aplicadas automaticamente no boot (`database/migrate.js`).

## IA no Backend (Responses API)

### Segurança
- A chave `OPENAI_API_KEY` fica **somente** no backend via variável de ambiente.
- Nunca publique chave em frontend, HTML/EJS, logs, seed/migration ou README.

### Variáveis de ambiente
Copie `.env.example` para `.env` no servidor e preencha:

```bash
AI_ENABLED=true
OPENAI_API_KEY=
OPENAI_MODEL_TEXT=gpt-4o-mini
OPENAI_MAX_OUTPUT_TOKENS=300
OPENAI_TIMEOUT_MS=20000
```

### Funcionalidades IA entregues
- **Assistente IA geral**: `/ai/chat` (contextos: geral, OS, equipamento, preventiva, academia).
- **IA na OS**: ações na tela de OS (`/os/:id`) para análise, causa, inspeções, materiais, execução segura e resumo técnico.
- **IA na Preventiva**: ações na tela da preventiva (`/preventivas/:id`) para checklist, criticidade, orientação e recomendação.
- **Professor IA (Academia)**: mantém fluxo existente e fallback amigável quando IA não está disponível.

### Teste manual rápido
1. Suba o sistema com `AI_ENABLED=false` e valide mensagem amigável.
2. Suba com `AI_ENABLED=true` e sem `OPENAI_API_KEY`, valide fallback e aviso.
3. Configure `OPENAI_API_KEY` e valide respostas em:
   - `/ai/chat`
   - `/os/:id` (botões de IA)
   - `/preventivas/:id` (botões de IA)
   - `/academia/professor-ia`
