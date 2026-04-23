# Regra de Pontuação e Benefício por OS (100 pontos)

## 1) Comunicado oficial (curto)

**Assunto: Nova regra de pontuação por Ordem de Serviço (OS)**

A partir desta atualização, a pontuação dos colaboradores passará a considerar a **participação real na OS**, e não apenas o usuário que finalizou a ordem no sistema.

### Regras
- Cada colaborador possui meta individual de **100 pontos**.
- Em OS com 2 ou mais participantes, os pontos serão **divididos entre os participantes cadastrados**.
- A divisão deverá ser transparente e auditável para todos.
- Regra inicial sugerida: divisão igualitária (ex.: 50/50 em OS com 2 pessoas), com possibilidade de parametrização futura.

### Benefício
- Ao atingir **100 pontos**, o colaborador fica **apto a 1 sábado de folga**.

### Controle
- A pontuação será acompanhada em relatório/planilha/sistema com histórico por OS e por colaborador.

---

## 2) Prompt pronto para time de sistema (IA/dev)

Precisamos implementar uma regra de pontuação por colaborador com base nas Ordens de Serviço (OS), incluindo colaboradores que participaram, mesmo quando não foram os finalizadores da OS.

### Objetivo
Garantir que a pontuação reflita corretamente a participação real dos colaboradores e habilitar benefício ao atingir 100 pontos.

### Regras de negócio
1. **Meta de benefício**
   - Ao atingir **100 pontos**, o colaborador ganha direito a **1 sábado de folga**.

2. **Pontuação por OS com múltiplos colaboradores**
   - Toda OS deve considerar **todos os colaboradores participantes**, e não apenas quem finalizou.
   - Mesmo que apenas um colaborador tenha fechado/finalizado a OS, os pontos devem ser distribuídos entre os participantes cadastrados.

3. **Divisão de pontos**
   - Dividir os pontos da OS entre os participantes conforme regra configurável.
   - Regra padrão sugerida: **divisão igualitária** entre participantes.
   - Permitir ajuste futuro da regra sem alteração estrutural grande (parametrização).

4. **Base histórica (reprocessamento)**
   - Reprocessar OS já existentes para recalcular pontuação de colaboradores que participaram e não apareceram no painel.
   - Validar casos conhecidos após o ajuste:
     - **Rodolfo**
     - **Emanuel**
     - **Salviano**

5. **Exibição no sistema (painel/relatório)**
   - Exibir por colaborador:
     - Nome
     - Total de pontos acumulados
     - Quantidade de OS consideradas
     - Status de benefício: **“Apto ao sábado de folga”** quando pontuação >= 100

6. **Auditoria e rastreabilidade**
   - Em cada OS, registrar:
     - Quem participou
     - Quem finalizou
     - Quantos pontos foram atribuídos a cada participante
   - Garantir transparência para conferência da gestão/RH.

### Critérios de aceite
- [ ] Colaboradores participantes aparecem na pontuação mesmo sem finalizar OS.
- [ ] Pontos de OS com múltiplos participantes são distribuídos corretamente.
- [ ] Rodolfo, Emanuel e Salviano aparecem com pontuação coerente após reprocessamento.
- [ ] Benefício de sábado de folga é marcado automaticamente ao atingir 100 pontos.
- [ ] Relatórios exibem dados completos e auditáveis.
