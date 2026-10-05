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


frontend:
  - task: "Fix: Android Gradle build fails — rootProject.name ends with '.'"
    implemented: true
    working: "NA"
    file: "/app/frontend/app.json"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: >
          Build log (Job 0b1df3a1-...) showed RUN_GRADLEW failing with:
          "The project name 'T.E.R.E.S.A.' must not start or end with a '.'"
          at /home/expo/workingdir/build/android/settings.gradle:34. Gradle 9.3.1
          introduced this validation. Fix: changed expo.name from "T.E.R.E.S.A."
          to "T.E.R.E.S.A" (removed trailing period) so Gradle's
          rootProject.name is valid. Preserved the branded display name on iOS
          by adding ios.infoPlist.CFBundleDisplayName = "T.E.R.E.S.A." (iOS has
          no such restriction). On Android the launcher label becomes
          "T.E.R.E.S.A" which keeps the acronym intact. NO changes to BLE
          UUIDs, bundle identifier (com.emergent.woundhealing.s4m7rd), package,
          scheme, slug, business logic, DB, or any screen content.
          Metro bundling (EAGER_BUNDLE), expo-doctor (20/20), lint and web
          preview all pass. The actual Gradle run can only be validated by
          re-triggering the EAS Android build.

test_plan:
  current_focus:
    - "Fix: Android Gradle build fails — rootProject.name ends with '.'"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: >
      Pure config fix in app.json. Please run FRONTEND regression ONLY (web
      preview is fine; the real Gradle test needs the EAS deploy re-run which
      is not reachable from here). Validate: (1) login as doctor and
      patient_monitored still works, (2) Home renders without issue, (3) the
      TopBar / drawer still shows the "T.E.R.E.S.A." branding (the brand
      *inside* the UI is hard-coded in TopBar.tsx and is NOT driven by
      app.json name), (4) no console errors on load. Do not try to validate
      Gradle; that only runs in the EAS pipeline.


frontend:
  - task: "Fix: login/register always fail on installed APK (preview URL points to ephemeral container)"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/services/api.ts, /app/frontend/.env, /app/frontend/app/login.tsx, /app/frontend/app/register.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: >
          User reported "sempre dando falha no login e para criar conta" on
          the installed APK. Root cause: the APK was built with
          EXPO_PUBLIC_BACKEND_URL pointing to the preview container
          (wound-healing-1.preview.emergentagent.com), which is ephemeral and
          goes offline when the preview container pauses. The persistent
          production backend lives at wound-healing-1.emergent.host.

          Fix (3 parts, all additive — nothing existing was repointed):

          1) Added a NEW env var `EXPO_PUBLIC_PROD_BACKEND_URL=https://wound-healing-1.emergent.host`
             to /app/frontend/.env. The existing EXPO_PUBLIC_BACKEND_URL is
             left alone so dev-server / Expo Go / web preview keep using the
             preview container (hot reload works).

          2) /app/frontend/src/services/api.ts: BASE_URL now selects at
             bundle-time via `__DEV__` — DEV builds (Metro, Expo Go, web
             preview) keep hitting the preview URL; RELEASE builds (APK/IPA
             end-users install) hit the permanent production URL. Fallback to
             preview URL if PROD is not set, so older envs still work.

          3) Added a 15 s AbortController timeout + readable network error
             messages ("Sem conexão com o servidor...", "O servidor demorou
             demais..."). Previously a slow preview container would hang the
             UI and surface a generic "Falha no login" with no explanation —
             which is likely what the user kept seeing.

          4) login.tsx and register.tsx now trim+lowercase e-mail and reject
             obviously malformed addresses before hitting the API (prevents
             confusing 401s from typos).

          Validated manually on web preview: register with a fresh e-mail
          returns 200 OK, lands on Home ("Olá, After 👋"), all authenticated
          calls (alerts, readings/latest, contacts, wound-photos/latest)
          return 200 OK. No regression. The REAL fix for the user's APK takes
          effect once they regenerate the Android build via the Publish
          panel — the new APK will embed the production URL instead of the
          preview one.

test_plan:
  current_focus:
    - "Fix: login/register always fail on installed APK (preview URL points to ephemeral container)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: >
      Pure frontend fix. Please validate on the web preview that NOTHING
      regressed around auth: (1) login works with doc.teste@teste.com /
      senha123 (doctor) and pm.ble@teste.com / senha123 (patient_monitored);
      (2) register with a brand-new email succeeds and lands on Home; (3) new
      e-mail validation rejects "notanemail" gracefully with a toast;
      (4) when the backend is NOT reachable the user sees a readable "Sem
      conexão..." message (hard to simulate, OK to skip if preview is up);
      (5) no new console errors; (6) /auth/me on cold-load works when a valid
      token is already in storage. Do NOT try to validate the APK behavior —
      that requires regenerating the Android build via EAS, which is a
      separate step the user triggers from the Publish panel.
