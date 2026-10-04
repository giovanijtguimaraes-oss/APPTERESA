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

user_problem_statement: >
  Validação final da conexão BLE real com o TERESA01 (ESP32-C3): o app deve
  encontrar o dispositivo, conectar aos UUIDs corretos, receber notificações
  TEMP/HUM/STATE, exibir valores reais na Home do paciente monitorado,
  detectar desconexão e reconectar automaticamente, SEM usar dados simulados
  quando o TERESA01 estiver conectado. Firmware, UUIDs e protocolo não devem
  mudar.

frontend:
  - task: "BLE: new ConnectionState variants (reconnecting, bt_off, unauthorized)"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/services/ble.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added reconnecting / bt_off / unauthorized states, Android runtime permissions, BT state subscription, raw frame diagnostic log, reconnect-attempt counter exposed via onMeta, and MAX_RECONNECT_ATTEMPTS raised to 10. Pure additive change — scan + connect + parse flow unchanged; firmware constants (name, UUIDs, payload) untouched."
  - task: "Connect screen enhancements (diagnostic panel, live telemetry, state hints)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(app)/connect.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Replaced single CONECTADO/DESCONECTADO row with per-state rendering (connected/connecting/scanning/reconnecting with attempt counter/bt_off/unauthorized/error). Added 'última leitura há Xs · N frames' sub-label when connected. Added Live Telemetry card (temperature/humidity/state) during connection. Added Diagnóstico BLE card with scrollable RX/INFO/WARN/ERROR entries and Limpar action. Added 'Abrir configurações' CTAs for bt_off and unauthorized states. Visible verification needed via screenshot — logic verified on web preview (shows the new empty Diagnóstico BLE panel + updated status card)."
  - task: "Monitored Home status card: live age + reconnect indicator"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(app)/(tabs)/home.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Equipment-status card now shows CONECTANDO…, RECONECTANDO X/Y, BLUETOOTH DESLIGADO, PERMISSÃO NEGADA besides CONECTADO/DESCONECTADO. When connected, adds a 'Última leitura há Xs · N frames' sub-label driven by a 1s ticker + onMeta. No change to displayTemp/displayHum/treatmentState logic (telemetry still wins when connected)."

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 6
  run_ui: true

test_plan:
  current_focus:
    - "BLE: new ConnectionState variants (reconnecting, bt_off, unauthorized)"
    - "Connect screen enhancements (diagnostic panel, live telemetry, state hints)"
    - "Monitored Home status card: live age + reconnect indicator"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: >
      Only web/preview regression check is needed here; real BLE verification is
      a physical bench test that must happen on a native APK/IPA (see
      /app/BLE_BENCH_TEST.md). On the web preview please verify (a) login flows
      for doctor and patient_monitored still work and don't regress; (b) the
      Connect screen renders the new "Diagnóstico BLE" and the updated status
      card (gray dot + "Desconectado" + "Buscar dispositivos" + the "BLE
      funciona apenas em builds nativos" info box); (c) the Monitored Home
      card shows "DESCONECTADO" + 'Equipamento desconectado' badge (since BLE
      is unavailable on web). Backend endpoints did NOT change in this session,
      so any auth regression indicates a frontend-only side effect.
