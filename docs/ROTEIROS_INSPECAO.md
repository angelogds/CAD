# Roteiro de inspeção dos equipamentos

O fluxo segue a separação existente na lubrificação: o PCM distribui um roteiro a um mecânico e acompanha seus registros. Aqui a atividade é inspecionar a condição dos equipamentos e orientar a manutenção necessária.

## Mecânico

O menu **Roteiro de inspeção** abre `/inspecao/roteiros`. Cada mecânico consulta e registra apenas seus roteiros. Para cada equipamento, informa condição observada, prioridade sugerida e resultado: sem necessidade identificada, preventiva, corretiva ou ambas. As necessidades exigem descrição do serviço indicado.

É possível salvar parcialmente e enviar o roteiro completo ao PCM em uma única ação. O registro e o envio não abrem solicitações, não geram OS, não criam preventivas e não definem datas de manutenção. O relatório fica disponível para consulta depois do envio.

## PCM

Em **PCM → Preventivas → Roteiros de inspeção**, Admin, Encarregado e Supervisor de Manutenção podem:

1. Eleger um mecânico ativo vinculado a colaborador ativo, escolher a data e os equipamentos, e informar o que deve ser inspecionado.
2. Receber as orientações enviadas pelo mecânico.
3. Para cada necessidade, definir prioridade, data e mecânico executor. Somente essa ação gera a OS do tipo correspondente e a inclui na programação semanal existente do PCM.
4. Decidir não programar uma indicação, desde que registre justificativa.
5. Concluir a análise de todo o roteiro em uma única ação, depois de avaliar todas as indicações.

O executor da manutenção pode ser diferente do inspetor. Concluir o roteiro não fecha OS nem comprova execução de preventiva ou corretiva: esses serviços continuam seguindo seus fluxos próprios. As regras existentes de lançamento de OS preventiva permanecem aplicáveis.

## Persistência e compatibilidade

Migration aditiva `246_roteiros_inspecao_equipamentos.js`: roteiro, equipamentos inspecionados, decisões do PCM e histórico com autoria. Cada decisão programada guarda o vínculo com a OS, a data e o executor. As descrições originais do mecânico permanecem separadas do parecer do PCM.

Operações compostas são transacionais. Reenvios de programação reaproveitam a decisão existente, evitando duplicar OS ou agenda. Falhas ao criar ou programar a OS desfazem a operação inteira. O executor escolhido fica na programação; isso não inicia uma execução nem ocupa o mecânico antes da data.

A inspeção mensal existente em `/inspecao`, o roteiro de lubrificação e os planos preventivos atuais mantêm seus fluxos. Nenhum dado existente é marcado como realizado pela instalação desta funcionalidade.

## Validação

`node --test tests/roteiros-inspecao.integration.test.js` cobre propriedade do roteiro, permissões, inspeção sem geração de OS, calendário, envio completo, programação exclusiva do PCM, idempotência, rollback e renderização das duas visões. A validação funcional também deve incluir a suíte completa do repositório.
