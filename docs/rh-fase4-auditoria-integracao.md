# RH — Fase 4: integridade, autoatendimento, atestados e relatórios

Data da auditoria: 13/09/2026

## Objetivo

Concluir o módulo de RH como central integrada entre cadastro mestre de colaboradores, Escala/Banco de Horas, Meu Portal e gestão administrativa, preservando histórico e evitando cadastros paralelos.

## Achados críticos da auditoria

### 1. Cadastro mestre e Meu Portal não estão montados no `server.js`

Os módulos existem em `modules/colaboradores` e `modules/meu-portal`, mas o `server.js` atual não monta `/colaboradores` nem `/meu-portal`.

Efeito observado em produção:
- `/rh/colaboradores/1` responde normalmente;
- o botão `Cadastro mestre`, que aponta para `/colaboradores/1`, retorna 404.

Correção: montar os dois routers antes da rota raiz/TV e criar teste de regressão de roteamento.

### 2. Remover alguém da Escala não significa desligar a ficha mestre

A remoção de alocação semanal atua em `escala_alocacoes`. O RH, por outro lado, consulta a ficha mestre `colaboradores` e considera ativos os registros com status ativo.

Consequência: colaborador removido da escala pode continuar aparecendo corretamente no RH se a ficha profissional continuar ATIVA.

Regra definitiva: desligamento deve ser feito por status/ativo/soft-delete no cadastro mestre, nunca por DELETE físico. O histórico de OS, banco de horas, folgas, documentos, EPI, ferramentas e treinamentos deve ser preservado.

### 3. Risco de duplicação por nome com acento

A Escala possui `ensureColaborador()` que procura por `lower(nome)=lower(?)`. SQLite `lower()` não resolve equivalência entre `Junior` e `Júnior`.

Correção: normalizar nome de forma consistente antes de decidir pela criação de nova ficha e, quando houver candidatos duplicados, priorizar vínculo por `user_id` e registro ativo/canônico. Não fundir registros históricos automaticamente.

### 4. Atestado já tem conceito operacional, mas falta autoatendimento seguro

A Escala reconhece `ATESTADO` como ausência e `escala_folgas_programadas` já possui `anexo_path`, porém o Meu Portal não possui rota de envio de atestado pelo próprio colaborador nem fluxo administrativo de recebimento/arquivamento.

Implementar autoatendimento com arquivo privado, sem CID/diagnóstico, integrado à ausência do colaborador e com notificação para RH, ADMIN e liderança de manutenção. Liderança recebe somente informação operacional da ausência; documento fica restrito ao colaborador dono, RH e ADMIN.

### 5. PDFs do RH devem reutilizar o motor/padrão existente

`modules/escala/escala.pdf.js` já possui PDFKit A4, cabeçalho verde, logo, rodapé, tabelas, paginação e identidade Campo do Gado. Reutilizar este padrão em vez de criar um segundo motor visual.

## Entregas propostas

### PR 1 — Integridade e fonte única de colaboradores

- montar `/colaboradores` e `/meu-portal` no `server.js`;
- revisar todos os links do RH para rotas existentes;
- padronizar criação/resolução de colaborador na Escala;
- impedir nova duplicidade por variações de acento/caixa/espaços;
- adicionar ação administrativa de `ATIVO` / `INATIVO` / `DESLIGADO`, sem apagar histórico;
- exibir apenas ativos nas buscas operacionais do RH por padrão;
- permitir filtro explícito para inativos/desligados quando RH precisar consultar histórico;
- identificar duplicidades existentes para tratamento manual seguro, sem merge automático de IDs.

### PR 2 — Atestado pelo funcionário + notificações

- adicionar área `Enviar atestado` no Meu RH;
- upload PDF/JPG/JPEG/PNG/WEBP, máximo 10 MB;
- armazenar em `DATA_DIR/rh/atestados`, fora de pasta pública;
- identidade sempre resolvida pela sessão (`users.id -> colaboradores.user_id`);
- datas de início/fim da ausência e observação administrativa curta;
- registrar ausência operacional `ATESTADO` sem debitar Banco de Horas;
- notificar RH, ADMIN, encarregado/supervisor de manutenção;
- não expor arquivo para liderança operacional;
- RH pode baixar, marcar recebido/arquivado e consultar pela ficha do colaborador;
- colaborador pode consultar apenas seus próprios envios;
- registrar auditoria.

### PR 3 — PDFs e relatórios do RH

- PDF individual de folga/compensação disponível assim que a solicitação estiver APROVADA;
- PDF individual com foto (quando disponível), nome, função, setor, saldo, data da folga, horas compensadas, data/origem do serviço, OS/equipamento e descrição do serviço quando existentes;
- PDF consolidado por período com todos os colaboradores e suas folgas;
- cada colaborador em bloco próprio;
- filtros por colaborador, setor, período e status;
- não inventar origem do serviço: quando não houver vínculo confiável, indicar `Origem não informada`;
- reutilizar cabeçalho/rodapé e identidade visual de `escala.pdf.js` e padrão de solicitações;
- permissões: RH/ADMIN para relatórios administrativos; funcionário apenas seus próprios documentos/folgas.

### PR 4 — Fechamento 100% funcional

- smoke test ADMIN, RH, DIRETORIA, liderança de manutenção e COLABORADOR;
- desktop, tablet e celular 360–430 px;
- todas as views `/rh`, `/rh/colaboradores`, `/rh/jornada`, `/rh/folgas`, `/rh/exames`, `/rh/documentos`, `/rh/treinamentos`, `/meu-portal/rh`, cadastro mestre e downloads;
- testes de permissão e tentativa de acesso cruzado;
- testes de upload inválido/tamanho excedido;
- testes de funcionário desligado/duplicado;
- testes de aprovação de folga e PDF;
- regressão em Escala/Banco de Horas/OS;
- CI antes de merge e smoke pós-deploy.

## Regras de segurança e banco

- nenhuma exclusão destrutiva de colaborador;
- preservar IDs e relacionamentos históricos;
- migrations apenas aditivas/compatíveis;
- arquivos médicos/atestados sempre privados;
- não armazenar CID, diagnóstico ou conteúdo clínico estruturado;
- Diretoria continua com visão gerencial sem acesso a anexos sensíveis;
- RH não recebe `escala_manage`; aprovação operacional de folga permanece na liderança de manutenção;
- não duplicar tabelas que já possuam fonte de verdade.

## Critério final

O módulo será considerado concluído somente quando RH e colaborador conseguirem executar o fluxo completo sem depender de comunicação paralela: cadastro/vínculo -> jornada/banco -> solicitação/aprovação -> documento/atestado -> notificação -> consulta/arquivo -> PDF/relatório, com histórico preservado e permissões validadas.
