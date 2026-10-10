# Almoxarifado — requisitos validados em 09/10/2026

Fonte: [documento consolidado no Notion](https://app.notion.com/p/3f47ddca327c8150974edd5df1ef3d8e).

## Estado e finalidade
Regras de negócio e resumo consolidados nesta página foram validados por Ângelo nesta conversa. Implementação e validação operacional ainda pendentes. A validação do documento não significa que as alterações já estejam no sistema. Consolida as decisões desta conversa e os pontos a verificar no sistema Campo do Gado. Atualizado em 2026-10-09.
Repositório de referência: [angelogds/CAD](https://github.com/angelogds/CAD).
## Decisões do responsável
- Iniciar o controle por soldas e abrasivos.
- Classificar materiais automaticamente, sem confirmação obrigatória a cada recebimento.
- Identificar materiais de uso comum e discriminar quantidades previstas por empresa.
- Responsável principal pelos materiais comuns: encarregado da Reciclagem, atualmente Ângelo. Implementar por perfil/responsabilidade configurável, sem nome fixo no código.
- Materiais exclusivos seguem para o responsável do setor.
- Manter aprovação da Diretoria após cotação e antes da compra efetiva.
- Controle específico de cilindros e recargas de oxigênio fora desta etapa.
## Fluxo de compra e recebimento
1. Solicitação encaminhada pelo setor ou reposição preparada pelo sistema.
2. Avaliação do responsável competente.
3. Cotação por Compras.
4. Liberação pela Diretoria.
5. Compra efetivada por Compras junto ao fornecedor.
6. Acompanhamento da entrega pelo almoxarifado.
7. Conferência e confirmação da quantidade recebida.
8. Entrada da quantidade aceita no estoque.
9. Retirada posterior, com identificação de empresa, setor e destinatário.
Cotação ou autorização não representam compra efetivada. A lista “Compras a caminho” deve conter compras confirmadas com saldo a receber, e não cotações.
Recebimento total encerra a pendência de entrega em Compras independentemente da retirada. Preservar histórico e separar pendências financeiras.
Recebimento parcial incorpora apenas a quantidade recebida e mantém o restante pendente. Divergências e materiais rejeitados não entram como saldo livre.
## Cadastro e endereçamento
Cada item deve ter código único, descrição padronizada, categoria, subcategoria, unidade de estoque, unidade de compra e fator de conversão, quando necessário.
Endereço: zona, estante, prateleira e posição.
Itens conhecidos herdam automaticamente classificação e endereço cadastrados. Nomes alternativos de fornecedores devem apontar para o mesmo item quando forem efetivamente equivalentes.
Para itens novos, aplicar regras e reconhecimento da descrição. Se faltar especificação, sinalizar classificação pendente sem bloquear recebimento e sem atribuir localização falsa. Este tratamento é proposta técnica para revisão, não decisão já validada em operação.
Preservar especificações: tipo e tamanho dos discos; classificação e bitola dos eletrodos/arames; referência dos rolamentos e correias; grau, aplicação e natureza dos lubrificantes. Não unificar óleo 680 sintético da decanter com outro 680 apenas pelo número.
## Primeira etapa: soldas e abrasivos
- Eletrodos: referência, bitola e peso.
- Arames de solda: processo, classificação, diâmetro e peso.
- Discos de corte, desbaste e flap: tipo, diâmetro e demais especificações necessárias.
Compra por caixa e retirada por unidade ou quilo exigem conversão cadastrada. “Uma caixa” não é quantidade universal.
Realizar contagem inicial para que o saldo do sistema corresponda ao físico antes de ativar reposição automática.
## Materiais comuns e empresas
Marcar uso comum no cadastro. A pré-solicitação discrimina quantidade prevista para Reciclagem, Frigorífico e Logística, quando aplicável.
A previsão por empresa não representa retirada nem consumo realizado.
Cada retirada identifica empresa e setor consumidores. O histórico permite ajustar as previsões de reposição.
Compartilhar endereço físico não elimina a identificação da empresa proprietária do saldo. Confirmar estrutura de empresas e saldos existente antes de definir a implementação.
## Política de reposição
Separar três parâmetros:
- Reserva de segurança: proteção contra atrasos e consumo inesperado.
- Ponto de reposição: nível em que começa o processo de compra.
- Saldo alvo: quantidade desejada após abastecimento.
Ponto de reposição = consumo médio por período multiplicado pelo prazo total de reposição, acrescido da reserva de segurança. Usar períodos compatíveis.
No Campo do Gado, considerar também o tempo de revisão, aprovação e cotação, além da entrega.
Exemplo apenas ilustrativo: consumo de 2 discos/dia, prazo total de 10 dias e segurança de 10 discos resultam em ponto de reposição de 30 discos.
Definir parâmetros iniciais com experiência do responsável; recalibrar usando histórico real. Não inventar mínimos para itens ainda sem definição.
## Pré-solicitação automática
Ao atingir o ponto de reposição, preparar necessidade com saldo físico, reservado, disponível, quantidade solicitada e comprada a receber.
Evitar duplicação e dupla contagem da mesma quantidade quando uma solicitação evolui para pedido.
Pedidos vencidos ou com entrega incerta devem gerar alerta; não representar cobertura garantida.
Almoxarife revisa quantidade e encaminha ao responsável. Materiais comuns seguem ao responsável principal da Reciclagem; exclusivos ao responsável do setor. Depois seguem cotação, Diretoria e compra.
## Correias dentro das preventivas — decisão consolidada
Usar o módulo de Preventivas existente, com inspeção de correias dentro da atividade. Evitar novo módulo ou menu independente.
Designar o mecânico responsável pela análise preventiva e das correias, separadamente do responsável pela lubrificação.
Na preventiva de segunda-feira, o mecânico inspeciona as correias de cada equipamento. Quando identifica necessidade de troca, aciona “Solicitar troca de correias”.
O equipamento deve possuir referências e quantidades por jogo cadastradas. O pedido já identifica equipamento, preventiva, mecânico, referência e quantidade necessária. As quantidades mencionadas na conversa — quatro para prensa, quatro para percoladora e duas por digestor — são exemplos a confirmar por equipamento, não valores universais.
O pedido chega ao almoxarifado para reserva e separação. Programar, solicitar ou reservar não reduz o saldo físico.
Na retirada efetiva, registrar entrega e baixar a quantidade uma única vez, vinculando-a à preventiva e ao equipamento. A conclusão da troca registra execução sem nova baixa. Devoluções de materiais não utilizados recompõem o saldo com histórico.
Mínimo por referência considera um jogo completo de reserva por equipamento como regra inicial; se uma referência atende vários equipamentos, somar as necessidades configuradas.
**Compatibilidade a verificar:** a documentação V4 descreve baixa ao concluir a preventiva. A implementação deverá conciliar esse comportamento com a nova decisão de baixa na retirada, preservando histórico e impedindo consumo duplicado.
## Retirada avulsa de correias durante a semana
O almoxarife pesquisa o equipamento por código ou nome na área de correias do estoque. Ao selecionar o equipamento, o sistema apresenta suas referências cadastradas.
Registrar referência, quantidade realmente entregue, mecânico e equipamento. A retirada baixa estoque e fica identificada como atendimento avulso/corretivo.
Retirada não prova que a substituição foi executada. Confirmar a execução e sua data para registrar “troca recente”; enquanto não confirmada, mostrar “retirada recente — execução pendente”.
A próxima preventiva de segunda-feira permanece na agenda e deve inspecionar normalmente as correias. Troca recente não dispensa verificação nem provoca nova baixa automática.
## Troca recente e alerta de criticidade
Quando a inspeção identifica desgaste após troca recente, o mecânico comunica a necessidade e solicita nova troca pelo mesmo fluxo do almoxarifado.
A nova substituição confirmada gera ocorrência de possível falha prematura no módulo de Criticidade, vinculada ao equipamento e ao histórico das duas trocas.
Registrar referência e quantidades, datas e intervalo entre trocas, responsável, observação e evidências quando disponíveis. Horas de operação só são utilizadas se houver medição confiável.
O prazo considerado razoável deve ser configurável por aplicação/equipamento, ainda a definir. Não inventar um prazo único.
O alerta sinaliza necessidade de investigar tensão, alinhamento, polias, carga, especificação e qualidade do material; não atribui causa automaticamente.
O alerta não altera estoque e não muda sozinho a classificação de criticidade do equipamento. A retirada da nova troca produz sua própria baixa única.
## Painel gerencial
Priorizar ações em vez de excesso de cartões:
- Itens atingindo ponto de reposição.
- Itens na reserva de segurança ou em falta.
- Pré-solicitações aguardando encaminhamento.
- Pedidos atrasados e recebimentos parciais.
- Diferenças identificadas em contagem física.
Detalhe do item: físico, reservado, disponível, a receber, localização e consumo por empresa.
Indicadores propostos: falta de materiais, prazo completo de reposição, precisão do saldo, consumo e entregas completas no prazo.
## Contagem rotativa
Como evolução, contar pequenos grupos de materiais em intervalos definidos, confrontando físico e sistema. Ajustes precisam registrar motivo e responsável. A frequência será definida pela criticidade, movimentação e divergências observadas, não presumida.
## Critérios de validação futura
- Cotação não aparece como compra confirmada.
- Recebimento total sai da pendência de entrega sem exigir retirada.
- Parcial preserva apenas saldo a receber.
- Receber novamente a mesma operação não duplica entrada.
- Retirar e concluir preventiva não duplicam baixa.
- Preventiva de correias usa o módulo existente e responsável distinto da lubrificação.
- Pedido de correias permite reserva, separação e retirada por equipamento.
- Retirada avulsa não cancela a próxima inspeção.
- Aviso de troca recente depende de execução confirmada.
- Nova troca após desgaste prematuro gera alerta no módulo de Criticidade.
- Conversão caixa/unidade ou caixa/quilo funciona.
- Material comum mantém previsão e consumo por empresa separados.
- Reposição não duplica solicitação em andamento.
- Classificação de item conhecido não exige confirmação manual.
- Contagem e ajustes deixam histórico.
## Sequência proposta
1. Auditar o fluxo existente e conciliar status.
2. Contar e cadastrar soldas e abrasivos.
3. Organizar unidades, conversões e endereços.
4. Identificar empresas/setores nas retiradas.
5. Configurar mínimos, pontos de reposição e saldos alvo.
6. Ativar pré-solicitações e painel.
7. Conciliar plano de correias com retirada e preventiva.
Não foram realizadas alterações de código, migrations ou publicação nesta atividade.
## Documentação anterior
[Documento anterior no Notion](https://app.notion.com/p/3f27ddca327c8172a824e3f46a1f0572)
[Documento anterior no Notion](https://app.notion.com/p/3f27ddca327c815b8f1ecba73b30c6d3)
[Documento anterior no Notion](https://app.notion.com/p/3e97ddca327c812bb8abff0a0f572956)
## Referências pesquisadas
As referências documentam práticas específicas, não um procedimento universal de todas as grandes empresas. As regras acima são adaptação proposta ao Campo do Gado.
- [Vale — etapas de negociação, compra, logística e pagamento](https://www.vale.com/pt/como-emitir-nota-fiscal)
- [TOTVS — cálculo do ponto de pedido](https://centraldeatendimento.totvs.com/hc/pt-br/articles/29797691876631-Cross-Segmento-Backoffice-Linha-Protheus-SIGAEST-MATA290-Calculo-do-Ponto-de-Pedido)
- [TOTVS — solicitações e pedidos em aberto na reposição](https://centraldeatendimento.totvs.com/hc/pt-br/articles/29586316481559-Cross-Segmentos-Backoffice-Protheus-Ponto-de-Pedido-Solicita%C3%A7%C3%A3o-de-Compras-Repetida)
- [SAP — planejamento de materiais e serviços na manutenção](https://learning.sap.com/courses/exploring-business-processes-in-sap-s-4hana-asset-management-br/planejamento-de-materiais-e-servicos)
- [TOTVS — cadastro de produtos e unidades](https://centraldeatendimento.totvs.com/hc/pt-br/articles/4407153055767-Cross-Segmento-Backoffice-Linha-Protheus-SIGAEST-MATA010-Como-cadastrar-um-produto-no-Protheus)
- [TOTVS — inventário rotativo](https://centraldeatendimento.totvs.com/hc/pt-br/articles/235159868-Log%C3%ADstica-Linha-Logix-WMS-Invent%C3%A1rio-Rotativo)
## Mínimos definidos — soldas e abrasivos
Dados fornecidos pelo responsável nesta conversa. São reservas mínimas iniciais; ponto de reposição e saldo alvo ainda precisam ser definidos.
### Eletrodos
Marca habitual ESAB; outras marcas podem ser utilizadas mantendo especificação adequada. As referências OK 48 e OK 46 foram informadas pelo responsável; confirmar código comercial completo no cadastro.
- 7018 / OK 48, diâmetro 2,5 mm: mínimo 1 caixa, aproximadamente 10 kg.
- 7018 / OK 48, diâmetro 3,25 mm: mínimo 1 caixa, aproximadamente 10 kg.
- 7018 / OK 48, diâmetro 4 mm: mínimo 1 caixa, aproximadamente 10 kg.
- 6013 / OK 46, diâmetro 2,5 mm: mínimo 1 caixa, aproximadamente 10 kg.
- 6013 / OK 46, diâmetro 3,25 mm: mínimo 1 caixa, aproximadamente 10 kg.
- 6010: uso em atividades específicas; bitolas e mínimo ainda não definidos.
Peso por embalagem deverá ser confirmado para cadastrar a conversão.
### Arames MIG
- Arame tubular: diâmetro 1,2 mm, mínimo 1 rolo de 15 kg.
- Arame sólido: diâmetro 1,2 mm, mínimo 1 rolo de 15 kg.
O responsável corrigiu expressamente a medida para 1,2 mm em ambos. Classificação técnica dos arames ainda a especificar; não presumir apenas pelo diâmetro.
### Estante de solda e abrasivos
Agrupar soldas e abrasivos na estante indicada pelo responsável, mantendo separação por tipo e referência. Número da estante e posições ainda não definidos.
### Discos abrasivos
Tamanhos nominais informados em polegadas. Confirmar a medida exata da embalagem no cadastro, especialmente para a lixadeira pequena, sem substituir silenciosamente a medida informada.
- Desbaste 4 polegadas: mínimo 1 caixa.
- Desbaste 7 polegadas: mínimo 1 caixa.
- Desbaste 9 polegadas: mínimo 1 caixa.
- Corte 4 polegadas: mínimo 1 caixa.
- Corte 7 polegadas: mínimo 1 caixa.
- Corte 9 polegadas: mínimo 1 caixa.
- Flap 4 polegadas: mínimo 1 caixa.
- Flap 7 polegadas: mínimo 1 caixa.
**Flap para lixadeira de 9 polegadas não será incluído.**
Total: 8 referências iniciais de abrasivos, cada uma com mínimo de 1 caixa. Quantidade de discos por caixa, espessuras, aplicações e grãos de flap ainda a cadastrar. Não supor conteúdo uniforme entre caixas.

## Automação por código
Implementar cálculos, classificação por cadastro/regras, reservas, baixas, pré-solicitações e alertas com código determinístico. Agente OpenAI não é requisito desta etapa. Eventual interpretação por IA de descrições novas é evolução opcional, a avaliar separadamente.
