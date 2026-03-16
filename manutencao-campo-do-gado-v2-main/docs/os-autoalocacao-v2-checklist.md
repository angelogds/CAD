# Checklist manual — Autoalocação de OS (V2)

## Pré-condição de escala da semana atual
1. Configure uma semana em `escala_semanas` que contenha a data atual.
2. Defina em `escala_alocacoes`:
   - `plantao`: Rodolfo.
   - `diurno`: Diogo e Salviano.
   - `apoio`: Emanuel, Luís e Júnior.

## Cenários obrigatórios
1. **Noite (20:54), OS CRÍTICA**
   - Criar OS com grau `CRITICA`.
   - Esperado: executor = Rodolfo, turno_alocado = `NOITE`, status = `ABERTA`.

2. **Dia (10:00), OS BAIXA**
   - Criar OS com grau `BAIXA`.
   - Esperado: executor = apoio disponível (ex.: Júnior). Se não houver apoio livre, mecânico do diurno.

3. **Dia (10:05), OS ALTA**
   - Criar OS com grau `ALTA`.
   - Esperado: par mecânico+auxiliar conforme `equipe_pares` em ordem (Diogo+Emanuel; se ocupados, Salviano+Luís; etc.).

4. **Fechamento e retorno de disponibilidade**
   - Concluir/cancelar OS do Diogo.
   - Abrir nova OS `ALTA`.
   - Esperado: Diogo volta a ser elegível para alocação automática (não ocupado por status ativo).

## Reatribuição
1. Abra uma OS com status `AGUARDANDO_EQUIPE`.
2. Clique em **Reatribuir automaticamente** (`POST /os/:id/auto-alocar`).
3. Esperado: nova tentativa de autoalocação com `{ force: true }`.
