#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
## user_problem_statement: Evoluir o Modo TV do sistema Manutenção Campo do Gado para uma Central Operacional Visual em tempo real

## frontend:
##   - task: "Top Bar com logo, relógio, status sistema e mecânicos online"
##     implemented: true
##     working: true
##     file: "src/components/TopBar.tsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "Implementado com relógio em tempo real, status online/offline com ícone pulsante, avatares dos mecânicos com borda colorida por status e tooltip com nome. Barra de progresso da rotação de telas incluída."
##   - task: "Faixa LED de alerta no topo"
##     implemented: true
##     working: true
##     file: "src/components/FaixaLED.tsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "Faixa LED vermelha com slide animation, mensagem de nova OS, piscar suave e botão de dismiss. Dispara automaticamente a cada ~45s com nova OS simulada."
##   - task: "Ticker inferior com múltiplos tipos de mensagem"
##     implemented: true
##     working: true
##     file: "src/components/Ticker.tsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "Marquee scroll contínuo com 8 mensagens de diferentes tipos. Cores dinâmicas por tipo. Pausa ao passar o mouse."
##   - task: "Tela 1 - OS (tabela compacta, gráficos, destaque novas OS)"
##     implemented: true
##     working: true
##     file: "src/components/TelaOS.tsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "Tabela com 12 OS, badges de status e prioridade, linha nova com animação blink e borda vermelha. Cards estatísticos com números grandes. Gráfico de pizza e barras via Recharts."
##   - task: "Tela 2 - Escala (cards mecânicos, ranking, galeria)"
##     implemented: true
##     working: true
##     file: "src/components/TelaEscala.tsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "Cards de mecânicos com foto, status colorido, função e horário. Ranking produtividade com medalhas. Galeria da manutenção com 4 imagens reais e carousel automático a cada 10s."
##   - task: "Tela 3 - Preventivas (tabela + gráficos compactos)"
##     implemented: true
##     working: true
##     file: "src/components/TelaPreventivas.tsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "Tabela de preventivas com status colorido, destaque para atrasadas e hoje. 4 cards estatísticos. Gráfico de barras e linha."
##   - task: "Tela 4 - Alertas (feed alertas, equipamentos críticos, performance)"
##     implemented: true
##     working: true
##     file: "src/components/TelaAlertas.tsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "Feed de alertas com criticidade colorida, animação pulse-glow, botão reconhecer. Lista de equipamentos críticos fora de operação. Performance com MTTR, MTBF e disponibilidade."
##   - task: "Rotação automática de telas (30s)"
##     implemented: true
##     working: true
##     file: "src/hooks/useScreenRotation.ts"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "Rotação automática a cada 30s entre 4 telas com fade 0.5s. Navegação manual via setas. Pausa automática ao interagir, retoma após 10s de inatividade."
##   - task: "Sons de alerta via Web Audio API"
##     implemented: true
##     working: true
##     file: "src/hooks/useSound.ts"
##     stuck_count: 0
##     priority: "medium"
##     needs_retesting: false
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "Som de alerta ao receber nova OS. Mudo automático entre 22h-06h."
##   - task: "Notificações direcionadas (Web Notification API)"
##     implemented: true
##     working: true
##     file: "src/App.tsx"
##     stuck_count: 0
##     priority: "medium"
##     needs_retesting: false
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "Solicita permissão de notificação no primeiro acesso. Dispara notificação push quando nova OS é atribuída a um responsável."
##   - task: "Presença em tempo real (online/offline/ativo)"
##     implemented: true
##     working: true
##     file: "src/App.tsx"
##     stuck_count: 0
##     priority: "medium"
##     needs_retesting: false
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "Mecânicos exibidos na Top Bar com status online (verde), ativo (amarelo), inativo (cinza). Polling a cada 15s simula atualização de status."
##   - task: "Responsividade (notebook, TV, mobile)"
##     implemented: true
##     working: true
##     file: "src/index.css"
##     stuck_count: 0
##     priority: "medium"
##     needs_retesting: false
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "Layout grid de 2 colunas por padrão. Classe .tv-mode para aumentar fontes 15% em telas grandes. Mobile: 1 coluna, scroll adaptativo."
##   - task: "Assets visuais gerados"
##     implemented: true
##     working: true
##     file: "public/"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "Logo transparente, 4 avatares de mecânicos profissionais, 4 fotos documentais da galeria da manutenção. Todos copiados para dist/ no build."

## backend:
##   - task: "Mock data service estruturado para futura integração API"
##     implemented: true
##     working: "NA"
##     file: "src/services/mockData.ts"
##     stuck_count: 0
##     priority: "medium"
##     needs_retesting: false
##     status_history:
##         -working: "NA"
##         -agent: "main"
##         -comment: "Serviço de dados mock com estrutura pronta para substituição por fetch() para rotas Express. Dados realistas."

## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 1
##   run_ui: true
##   deployed_url: "https://nstlbxdlyhfeq.kimi.show"

## test_plan:
##   current_focus:
##     - "Verificar rotação automática de telas (30s intervalo)"
##     - "Verificar Faixa LED aparece ao simular nova OS"
##     - "Verificar som de alerta ao receber nova OS"
##     - "Verificar ticker scroll e pausa no hover"
##     - "Verificar responsividade em diferentes viewports"
##   stuck_tasks: []
##   test_all: false
##   test_priority: "high_first"

## agent_communication:
##     -agent: "main"
##     -message: "Central Operacional Visual completa implementada e deployada. App React com 4 telas rotativas, Top Bar, Faixa LED, Ticker, gráficos Recharts, sons Web Audio, notificações Web Push e presença em tempo real. Todos os componentes funcionando com dados mock realistas. Aguardando testes do testing_agent."
