# Escala: localização e exclusão de colaboradores

A Escala usa o tema claro verde, branco e cinza e a navegação compartilhada em `views/escala/_tabs.ejs`. O painel prioriza Escala semanal, Escala completa, Registrar hora extra e Hora extra das 17h. Cards e tabela são modos alternativos. O formulário de hora extra usa a mesma captura no celular e no desktop.

## Localização de horas extras

- Novos inícios e finalizações exigem latitude, longitude e precisão válidas. O navegador captura novamente no envio, com `maximumAge: 0`. Negação, indisponibilidade ou timeout deixam o envio bloqueado, com opção de tentar novamente.
- O serviço valida as coordenadas, inclusive em POST direto. A migration 243 também impede inserções sem localização e a transição de `EM_ANDAMENTO` para `PENDENTE_APROVACAO` sem localização final.
- A hora do registro vem do servidor. A localização é capturada no momento da abertura: o modo desde as 17h conta o período desde as 17h e não produz uma coordenada retroativa desse horário.
- Apenas ADMIN e ENCARREGADO_MANUTENCAO (e aliases já reconhecidos) podem abrir o modo desde as 17h; antes das 17h a abertura é recusada. O fluxo normal continua com o início real.
- Os registros históricos sem GPS são preservados. Não foi acrescentada restrição por raio: esta mudança exige captura de coordenadas e permite a conferência no mapa.

## Exclusão restrita à Escala

`Gerenciar equipe → Excluir da Escala` está disponível à gestão da Escala. A confirmação informa o prazo. A rota POST `/escala/colaboradores/:id/excluir` aplica o mesmo RBAC no serviço.

A exclusão marca `colaboradores.fora_escala=1` e registra o prazo na tabela `escala_colaboradores_exclusoes` (migration 244). Não altera `users.ativo`, o perfil global, OS, estoque ou dados do RH. Não exclui automaticamente pessoas que já estavam marcadas como fora da escala antes da migration.

O funcionário deixa de aparecer nas listas, escalas semanais, horas extras, banco, folgas e novos relatórios da Escala. Links antigos de banco individual não exibem os registros. Solicitações pendentes de folga desse funcionário deixam de bloquear datas de pessoas ativas. O histórico permanece persistido durante seis meses, sem aparecer nas telas operacionais. A seleção de um funcionário excluído em formulário antigo é rejeitada; não é substituída pelo primeiro funcionário da lista.

`Retirar desta semana` remove somente a alocação semanal. É uma ação diferente de excluir o colaborador da Escala.

## Prazo e limpeza automática

O prazo é de seis meses de calendário a partir da exclusão, com ajuste para o último dia do mês quando necessário. Uma segunda exclusão não reinicia o prazo. A rotina executa na inicialização do servidor e a cada hora; prazos vencidos são tratados na próxima execução, inclusive após indisponibilidade do serviço.

A limpeza é transacional e restrita às tabelas explicitamente relacionadas à Escala: horas extras, movimentos do banco, folgas e solicitações, concessões/compensações, ausências, alocações, rodízios e adicionais. Remove também referências pessoais em snapshots de auditoria e os metadados de cobertura de sábado que referenciem o colaborador; os lançamentos individuais de outras pessoas permanecem. A identificação global do colaborador é preservada, junto de um marcador mínimo da exclusão que impede reaparecimento por sincronização de perfil.

Fotos e anexos próprios em `/uploads/escala-horas/` só são removidos depois do commit e quando não são referenciados por outro registro. Falhas de remoção são tentadas no próximo ciclo. A rotina não modifica documentos exportados pelo usuário ou backups externos.

## Validação

Regressões cobrem GPS ausente/inválido, validação no SQLite, históricos anteriores, bloqueio antes das 17h, perfis, prazo exato, mês curto/ano bissexto, exclusão repetida, reaparecimento por sincronização, integridade das referências e preservação de outras pessoas, arquivos compartilhados e módulos externos. QA em banco isolado verifica telas em 390 e 1440px, início/fim com GPS, negação, POST direto, cards/tabela, filtros e exclusão pela interface.
