# Mapa do projeto — referência da Skill

Carregue apenas a seção necessária à tarefa.

## Base
- Entrada da aplicação: `server.js`
- Rotas canônicas e aliases: `config/routes.js`
- RBAC: `config/rbac.js`
- Banco: `database/db.js`
- Migrations: `database/migrations/`
- Testes: `tests/*.test.js`
- UI: `views/` + `public/`

Comandos úteis:
- desenvolvimento: `npm run dev`
- produção local: `npm start`
- migrations: `npm run migrate`
- testes: `npm test`
- build do CAD: `npm run build:cad-core`

## Rotas canônicas documentadas
Fonte: `docs/ARQUITETURA.md`.
- OS: `/os`
- Dashboard: `/dashboard`
- TV: `/tv`
- IA principal: `/ai`
- Inspeção: `/inspecao`
- Compras: `/compras`
- Almoxarifado: `/almoxarifado`
- Estoque: `/estoque`
- PCM: `/pcm`

Há compatibilidades legadas intencionais. Não remova alias sem teste e requisito explícito.

## Demandas
Código:
- `modules/demandas/demandas.routes.js`
- `modules/demandas/demandas.controller.js`
- `modules/demandas/demandas.service.js`
- `modules/demandas/demandas.materials.service.js`

Testes: procure `tests/demandas-*.test.js`.

## Solicitações / Compras / Almoxarifado / Estoque
Solicitações:
- `modules/solicitacoes/`

Compras:
- `modules/compras/`

Almoxarifado:
- `modules/almoxarifado/`

Estoque:
- `modules/estoque/`

Esses quatro domínios compartilham fluxo operacional. Antes de criar status ou vínculo novo, mapeie os campos e serviços existentes.

Testes úteis por prefixo:
- `tests/compras-*.test.js`
- `tests/almoxarifado-*.test.js`
- `tests/almox-*.test.js`
- testes de estoque/fluxo integrado relacionados ao requisito.

## OS
Código principal:
- `modules/os/os.routes.js`
- `modules/os/os.controller.js`
- `modules/os/os.service.js`
- `modules/os/os.permissions.js`
- serviços auxiliares no mesmo diretório.

`os.service.js` é grande. Pesquise por símbolo/caso de uso antes de ler o arquivo inteiro.

## PCM
- `modules/pcm/pcm.routes.js`
- `modules/pcm/pcm.controller.js`
- `modules/pcm/pcm.service.js`
- `modules/pcm/pcm.operational.service.js`
- `modules/pcm/pcm.intelligence.service.js`

## Escala
- `modules/escala/`

Use a estrutura real de escala/equipe para responsáveis e substituições. Não codifique nomes.

## Equipamentos
- `modules/equipamentos/`

Antes de criar histórico paralelo, verifique o histórico oficial já existente e vínculos com OS/estoque.

## Ferramental
- `modules/ferramental/`

Contém aceite, evidência, inspeção, inventário, ocorrência, PDF e serviços V2. Preserve rastreabilidade e regras existentes.

## Desenho técnico / CAD
- `modules/desenho-tecnico/`
- build: `npm run build:cad-core`

Há muitos testes `tests/desenho-tecnico-*.test.js` e `tests/cad-*.test.js`. Para alteração de CAD, use testes específicos antes da suíte completa.

## Banco
Há muitas migrations históricas. Regra absoluta:
- não modificar migration aplicada;
- criar migration nova para evolução de schema;
- manter compatibilidade com dados existentes;
- usar transação em operações multi-etapa quando houver risco de inconsistência.

## Padrão de investigação
Quando a tarefa disser, por exemplo, “corrigir Demandas”, comece por:
1. arquivos de `modules/demandas/`;
2. view diretamente usada pela rota;
3. testes `demandas-*`;
4. somente então módulos relacionados citados pelas chamadas reais.

Não comece por uma leitura integral de `server.js`, todas as migrations e todos os 200+ testes.
