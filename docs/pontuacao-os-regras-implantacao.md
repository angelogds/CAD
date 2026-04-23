# Regra de Pontuação e Ranking por OS (meta mensal: 100 pontos)

## 1) Comunicado oficial (curto)

**Assunto: Atualização da regra de pontuação por Ordem de Serviço (OS)**

A partir desta atualização, a pontuação dos colaboradores passa a considerar a **participação real na OS**, e não apenas o usuário que finalizou a ordem no sistema.

### Regras
- Cada colaborador possui meta individual de **100 pontos por mês**.
- Em OS com 2 ou mais participantes, os pontos serão **divididos igualmente entre os participantes cadastrados**.
- A divisão deverá ser transparente e auditável para todos.
- A regra de divisão precisa permanecer parametrizável para evoluções futuras.

### Pontuação por criticidade (vigente)
- **Baixa**: 0,5 ponto
- **Média**: 1,0 ponto
- **Alta**: 2,0 pontos
- **Crítica**: 3,0 pontos

### Ranking e benefício
- O painel atual deve focar no **ranking de desempenho dos mecânicos** (elegibilidade técnica).
- **Não exibir “sugestão de folga” automática na tela neste momento**.
- A folga de sábado permanece como política futura, baseada em regra de RH/operação.

### Diretriz operacional futura (política)
- Referência de benefício: até **1 folga/mês para mecânico** e **1 folga/mês para apoio operacional**.
- Regra de escala: evitar concessão para os dois perfis no mesmo sábado.
- Esta política será operacionalizada em etapa posterior (fora da tela atual de ranking).

---

## 2) Prompt pronto para time de sistema (IA/dev)

Precisamos implementar/ajustar a regra de pontuação por colaborador com base nas Ordens de Serviço (OS), incluindo todos os colaboradores participantes, mesmo quando não foram os finalizadores da OS.

### Objetivo
Garantir que a pontuação reflita corretamente a participação real dos colaboradores, com meta mensal de 100 pontos e ranking confiável para avaliação de desempenho.

### Regras de negócio
1. **Meta mensal de referência**
   - Acompanhar pontuação por ciclo mensal.
   - Meta de referência: **100 pontos no mês** por colaborador.

2. **Pontuação por criticidade (nova régua)**
   - **BAIXA = 0.5**
   - **MÉDIA = 1.0**
   - **ALTA = 2.0**
   - **CRÍTICA = 3.0**

3. **Pontuação por OS com múltiplos colaboradores**
   - Toda OS deve considerar **todos os colaboradores participantes**.
   - Mesmo que apenas um colaborador tenha fechado/finalizado a OS, os pontos devem ser distribuídos entre os participantes cadastrados.

4. **Divisão de pontos**
   - Regra padrão: **divisão igualitária** entre participantes da OS.
   - Exemplo: OS de criticidade ALTA (2 pontos) com 2 participantes ⇒ 1 ponto para cada.
   - A estratégia de divisão deve ser parametrizável.

5. **Base histórica (reprocessamento)**
   - Reprocessar OS já existentes para recalcular pontuação dos participantes que hoje não aparecem corretamente no painel.
   - Validar casos conhecidos após ajuste:
     - **Rodolfo**
     - **Emanuel**
     - **Salviano**

6. **Exibição no sistema (painel/relatório)**
   - Exibir por colaborador:
     - Nome
     - Total de pontos acumulados no mês
     - Quantidade de OS consideradas
     - Distribuição por criticidade
   - **Não exibir destaque/sugestão automática de folga na interface nesta etapa**.

7. **Auditoria e rastreabilidade**
   - Em cada OS, registrar:
     - Quem participou
     - Quem finalizou
     - Quantos pontos foram atribuídos a cada participante
     - Qual regra de peso/divisão foi aplicada
   - Garantir transparência para conferência da gestão/RH.

### Critérios de aceite
- [ ] Colaboradores participantes aparecem na pontuação mesmo sem finalizar OS.
- [ ] Pontos de OS com múltiplos participantes são distribuídos corretamente.
- [ ] Rodolfo, Emanuel e Salviano aparecem com pontuação coerente após reprocessamento.
- [ ] Meta mensal de 100 pontos é aplicada no período mensal de apuração.
- [ ] Pesos de criticidade seguem a régua: 0.5 / 1.0 / 2.0 / 3.0.
- [ ] Relatórios exibem dados completos e auditáveis.
- [ ] Tela de ranking não exibe sugestão automática de folga nesta fase.
