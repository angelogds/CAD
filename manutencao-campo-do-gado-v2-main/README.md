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

### Railway (deploy)
1. Configurar `DB_PATH=/data/app.db` no serviço.
2. Garantir volume persistente montado em `/data`.
3. Start command recomendado:
   ```bash
   npm ci && npm run migrate && npm start
   ```
4. O módulo gera PDFs em `/data/uploads/desenho-tecnico-pdf` automaticamente quando o volume está configurado.

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
