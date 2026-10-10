# Almoxarifado: implementação das regras validadas

Implementa a especificação preservada na PR #636. A migration 226 é aditiva: não apaga movimentações, solicitações, preventivas nem saldos existentes.

## Compras e recebimento

- A fila “Compras a caminho” exige quantidade efetivamente comprada e ainda não recebida. Cotação isolada não entra nessa fila.
- O recebimento é transacional e possui token para impedir entrada duplicada no reenvio do mesmo formulário. Recebimento parcial mantém a pendência; recebimento total encerra a fila ativa de Compras mesmo que a retirada ainda não tenha ocorrido.
- O histórico permanece disponível. Pedidos mistos preservam a cotação dos itens não comprados.
- Compra e recebimento usam a unidade de controle do item. Uma compra vinculada com unidade diferente é bloqueada até a conferência do cadastro/quantidade por embalagem; não se somam caixas a unidades ou quilos.

## Cadastro e reposição

- Reserva mínima, ponto de reposição explícito ou calculado, prazo total e saldo alvo são configurados no detalhe do material.
- Ponto calculado: reserva mínima + consumo diário médio dos últimos 90 dias × prazo total de aprovação/compra/entrega. Não há prazo inventado.
- A geração considera saldo físico menos reservas e compras ainda a receber. Uma pré-solicitação em andamento impede nova geração para o mesmo material.
- O servidor verifica a reposição a cada 15 minutos, usando um cadastro ativo real do Almoxarifado. Também existe ação manual. Sem política cadastrada/saldo alvo, não inventa pedido ou quantidade.
- O rascunho usa o módulo existente de pré-solicitações. O Almoxarifado revisa, ajusta distribuição/quantidades e encaminha ao responsável. Materiais comuns seguem para Manutenção da Reciclagem; materiais exclusivos seguem o setor cadastrado. Não há pessoa hardcoded nem nova permissão de aprovação.
- Reposição para estoque comum fica livre após recebimento; uma compra destinada a uma solicitação/OS continua reservada para sua entrega.
- Empresa e setor consumidor ficam registrados nas retiradas diretas e identificadas. Material COMUM não é convertido em exclusivo pelo recebimento.

## Classificação e endereços

- Regras determinísticas reconhecem as famílias descritas: soldas, abrasivos, elétrica, pintura, rolamentos/mancais/retentores, lubrificantes e correias.
- O endereço real é configurado uma vez por família e herdado em cadastros/recebimentos, preservando endereços explícitos já existentes.
- A descrição e a referência do material são preservadas; o código não agrupa saldos de bitolas, modelos ou especificações diferentes.
- Descrição desconhecida/ambígua fica sinalizada para regularização do cadastro; não exige confirmação de categoria a cada recebimento conhecido.

## Correias dentro das preventivas

- A inspeção usa o módulo atual de Preventivas e os responsáveis já atribuídos, independente da lubrificação.
- O mecânico solicita uma referência vinculada ao equipamento, com a quantidade padrão do jogo preenchida e editável.
- Almoxarifado reserva/separa; entrega registra a única baixa física, o equipamento, o mecânico e o destino consumidor. Reservas são protegidas no banco.
- O mecânico confirma a data real da substituição. Conclusão da preventiva não repete a baixa. Material não usado pode ser devolvido antes da confirmação da troca; pedidos não retirados podem ser cancelados.
- A retirada avulsa usa busca por código/nome do equipamento e suas referências cadastradas. Reenvio com o mesmo token não repete a retirada.
- O histórico de troca permanece visível na inspeção seguinte; a programação preventiva não é cancelada por troca avulsa.
- Nova troca da mesma referência no mesmo equipamento, antes do intervalo configurado, gera alerta de possível falha prematura na engenharia/criticidade do PCM. A criticidade não é alterada automaticamente. Sem intervalo configurado, não inventa alerta.
- Data operacional usa America/Bahia. Não são inventadas horas de uso nem causas de falha.

## Dados que precisam ser configurados na operação

- O cadastro mostra os mínimos validados: 7018/OK48 (2,5; 3,25; 4 mm), 6013/OK46 (2,5; 3,25 mm), 10 kg por referência; MIG tubular e sólido 1,2 mm, 15 kg por tipo; desbaste/corte 4, 7 e 9, flap 4 e 7, uma caixa por referência. 6010 sem mínimo definido.
- É necessário vincular esses parâmetros às referências reais do catálogo, confirmar a quantidade de discos por caixa e a medida/especificação exata. Não foram criados códigos fictícios, saldos ou conversões presumidas.
- Configurar endereços físicos, prazos, saldos alvo, distribuição e intervalo de investigação por equipamento.
- Oxigênio continua fora desta etapa. Não há dependência de agente OpenAI para esse controle.

## Falhas anteriores tratadas a pedido do usuário

A suíte principal tinha 25 falhas antes desta branch. Foram corrigidos: leitura ausente de temperatura tratada como zero e retorno do painel executivo de Compras à base incorreta. Testes históricos de rotas/permissões foram alinhados ao contrato atual, preservando negativas de acesso. Testes CAD continuam verificando geometria, bibliotecas e exportações, mas deixam de exigir que bibliotecas MLightCAD reiniciem o editor 2D estável adotado em c19285b. O teste de migration de andamento passa a usar o SQLite do projeto, sem exigir um executável sqlite3 externo.

A validação inclui banco temporário com todas as migrations, proteção de reservas, idempotência, retirada/devolução, confirmação da troca, alerta prematuro, recebimento parcial/total, histórico, rateio e renderização das telas. O banco persistente da operação não foi acessado nem alterado durante os testes. Merge não é confirmação de deploy: verificar publicação e aplicação da migration no ambiente antes do uso.
