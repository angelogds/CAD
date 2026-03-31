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
```

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
- `GET /desenho-tecnico/cad/novo` — criação de novo desenho CAD
- `POST /desenho-tecnico/cad` — salvar desenho CAD inicial
- `GET /desenho-tecnico/cad/:id` — visualizar desenho
- `GET /desenho-tecnico/cad/:id/editor` — editar desenho
- `POST /desenho-tecnico/cad/:id` — atualizar CAD (JSON)
- `POST /desenho-tecnico/cad/:id/metadata` — atualizar metadados
- `POST /desenho-tecnico/cad/:id/render-3d` — gerar preview técnico 3D
- `GET /desenho-tecnico/cad/:id/pdf` — gerar PDF técnico

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

## IA no Backend (Responses API)

### Segurança
- A chave `OPENAI_API_KEY` fica **somente** no backend via variável de ambiente.
- Nunca publique chave em frontend, HTML/EJS, logs, seed/migration ou README.

### Variáveis de ambiente (`.env`)
Copie `.env.example` para `.env` no servidor e preencha:

```bash
AI_ENABLED=true
OPENAI_API_KEY=sk-...
OPENAI_MODEL_TEXT=gpt-4o-mini
OPENAI_TIMEOUT_MS=20000
OPENAI_MAX_OUTPUT_TOKENS=300

# opcionais usados por outros fluxos
OPENAI_MODEL_ACADEMIA=gpt-4o-mini
OPENAI_MODEL_AVALIACAO=gpt-4o-mini
```

### Endpoints IA / áudio / geração técnica

#### Assistente IA (texto)
- `POST /ai/ask`
- `POST /ai/os/:id/analyze`
- `POST /ai/preventivas/:id/analyze`

#### Fluxo OS assistido por IA
- `POST /os` → abertura da OS com enriquecimento técnico automático (criticidade, diagnóstico, causa provável, equipe sugerida etc.)
- `POST /os/:id/fechar` (ou `POST /os/:id/concluir`) → fechamento da OS com geração técnica automática de descrição de serviço, ação corretiva e recomendação

#### Geração técnica de desenho
- `POST /desenho-tecnico/cad/:id/render-3d` → gera preview técnico 3D a partir do CAD
- `GET /desenho-tecnico/cad/:id/pdf` → gera PDF técnico

#### Áudio / transcrição
- Áudio de notificação é servido como arquivo estático em `/audio/*.mp3` (ex.: dashboard e push).
- **Não existe endpoint HTTP público de transcrição de áudio neste branch.**

### Fluxo de abertura e fechamento assistidos

#### 1) Abertura assistida (`POST /os`)
1. Operador envia não conformidade + sintoma principal.
2. Backend monta contexto (equipamento, histórico, OS parecidas, preventivas).
3. IA retorna JSON técnico estruturado.
4. Sistema persiste os campos IA (`ai_diagnostico_inicial`, `ai_criticidade_sugerida`, `ai_sugestao_equipe_json`, etc.) e abre a OS.

#### 2) Fechamento assistido (`POST /os/:id/fechar`)
1. Operador anexa pelo menos uma foto de fechamento.
2. Backend solicita à IA texto técnico de encerramento.
3. Sistema grava saída estruturada (`ai_descricao_servico_executado`, `ai_acao_corretiva_realizada`, `ai_observacao_final_tecnica` etc.) e conclui OS.

### Fallback quando IA estiver indisponível
- `AI_ENABLED=false` → backend retorna mensagem amigável de IA desativada.
- Sem `OPENAI_API_KEY` (ou chave inválida) → backend retorna erro de configuração controlado.
- Timeout/provedor indisponível/rate limit → backend responde erro amigável (`503`) sem quebrar renderização de tela.
- Em fluxos internos de OS (abertura/fechamento), o sistema usa fallback técnico padrão para manter continuidade operacional.

## Exemplos de payload e resposta JSON estruturada

### 1) Assistente geral (`POST /ai/ask`)

**Payload**
```json
{
  "contexto": "geral",
  "pergunta": "Quais inspeções iniciais devo fazer em uma bomba centrífuga com aquecimento?"
}
```

**Resposta (sucesso)**
```json
{
  "ok": true,
  "resposta": "1) Verifique vibração..."
}
```

**Resposta (fallback IA indisponível)**
```json
{
  "ok": false,
  "error": "A IA demorou para responder. Tente novamente.",
  "code": "AI_TIMEOUT"
}
```

### 2) Análise de OS (`POST /ai/os/:id/analyze`)

**Payload**
```json
{
  "action": "analisar"
}
```

**Resposta (sucesso)**
```json
{
  "ok": true,
  "resposta": "Diagnóstico técnico recomendado..."
}
```

### 3) Salvar CAD (`POST /desenho-tecnico/cad/:id`)

**Payload (resumido)**
```json
{
  "objects": [
    { "id": "L1", "type": "line", "x1": 10, "y1": 10, "x2": 120, "y2": 10 }
  ],
  "layers": {
    "geometria_principal": { "visible": true, "locked": false }
  }
}
```

**Resposta (sucesso)**
```json
{
  "ok": true,
  "cad": {
    "objects": [
      { "id": "L1", "type": "line" }
    ]
  },
  "preview3d": null,
  "compatible3d": false
}
```

### 4) Render 3D (`POST /desenho-tecnico/cad/:id/render-3d`)

**Resposta (sucesso)**
```json
{
  "ok": true,
  "preview3d": {
    "items": [
      { "type": "extrude", "depth": 10 }
    ]
  }
}
```

**Resposta (sem geometria compatível)**
```json
{
  "ok": false,
  "error": "Desenho CAD sem geometria compatível com extrusão simples."
}
```

## Checklist manual (mobile + regressão do fluxo OS)

### Mobile (responsividade e usabilidade)
- [ ] Abrir `/os/novo` em viewport mobile (320px–430px).
- [ ] Validar botão de anexar fotos de abertura (captura por câmera/galeria).
- [ ] Validar preview das miniaturas antes de salvar.
- [ ] Abrir `/os/:id` e validar leitura dos cards sem overflow horizontal.
- [ ] Executar fechamento no mobile com upload de foto obrigatória.
- [ ] Validar feedback visual de sucesso/erro (flash messages).

### Regressão do fluxo OS (abertura → execução → fechamento)
- [ ] Criar OS corretiva com sintoma e não conformidade válidos.
- [ ] Confirmar atribuição automática de equipe (quando disponível).
- [ ] Iniciar OS (`/os/:id/iniciar`) e validar status `ANDAMENTO`.
- [ ] Pausar OS (`/os/:id/pausar`) e validar status `PAUSADA`.
- [ ] Fechar OS sem foto e confirmar bloqueio com mensagem amigável.
- [ ] Fechar OS com foto e confirmar status final `FECHADA`.
- [ ] Confirmar campos técnicos IA persistidos na OS (quando IA ativa).
- [ ] Repetir cenário com IA desligada e confirmar fallback operacional sem quebra de fluxo.
