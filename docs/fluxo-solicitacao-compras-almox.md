# Fluxo reforçado — Solicitação de Material → Compras → Diretoria → Almoxarifado

## Diagrama do fluxo

```text
SOLICITAÇÃO DE MATERIAL
│
├── Criada por manutenção, produção ou diretoria
├── Gera PDF padrão Campo do Gado
├── Gera checklist de itens
└── Entra na fila de compras
        │
        ▼
COMPRAS
│
├── Recebe solicitação
├── Inicia cotação
├── Anexa cotação
├── Escolhe fornecedor
├── Envia para aprovação
└── Marca como comprada
        │
        ▼
DIRETORIA
│
├── Aprova
├── Reprova
└── Devolve para revisão
        │
        ▼
ALMOXARIFADO
│
├── Recebe pedido comprado
├── Confere item por item
├── Marca parcial ou total
├── Atualiza estoque
├── Separa para o solicitante
└── Entrega material
        │
        ▼
SOLICITANTE
│
├── Recebe notificação
├── Acompanha status
├── Retira material
└── Solicitação é fechada
```

## Resumo técnico

Hoje o sistema já está bem dividido por etapa, mas precisa reforçar as **ramificações de status** e os **gatilhos de transição** para garantir previsibilidade operacional.

### Pontos de reforço recomendados

1. **Máquina de estados única do fluxo**
   - Centralizar os status canônicos em uma enum única.
   - Bloquear transições inválidas no backend.

2. **Ramificações explícitas por decisão da diretoria**
   - `aprovada`: segue para almoxarifado.
   - `reprovada`: fecha fluxo com motivo obrigatório.
   - `revisao`: retorna para compras com pendência registrada.

3. **Controle item a item no recebimento**
   - Permitir recebimento parcial sem perder rastreabilidade.
   - Encerrar somente quando todos os itens estiverem entregues ou cancelados.

4. **Rastreio de eventos (timeline/auditoria)**
   - Registrar autor, data/hora, ação, observação e anexos em cada mudança.
   - Expor histórico para solicitante, compras, diretoria e almox.

5. **SLA e notificações por etapa**
   - Notificar automaticamente na troca de status.
   - Alertar atrasos por tempo parado em fila (compras, aprovação, conferência, retirada).

6. **Motivos obrigatórios nas exceções**
   - Reprovação, devolução para revisão e cancelamentos com justificativa obrigatória.

7. **Fechamento com critérios objetivos**
   - Solicitação só fecha quando:
     - entrega total confirmada, ou
     - encerramento administrativo com motivo formal.

### Modelo sugerido de status

- `rascunho`
- `enviada_compras`
- `em_cotacao`
- `aguardando_aprovacao`
- `aprovada`
- `reprovada`
- `em_revisao_compras`
- `comprada`
- `em_conferencia_almox`
- `parcial_entregue`
- `disponivel_retirada`
- `fechada`
- `cancelada`

### Resultado esperado

Com esse reforço, o fluxo ganha:
- governança entre áreas,
- rastreabilidade ponta a ponta,
- redução de retrabalho,
- previsibilidade no atendimento ao solicitante.
