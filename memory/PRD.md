# T.E.R.E.S.A. — Product Requirements Document (iteration 4)

## Nome do produto
**T.E.R.E.S.A.** — Tecnologia Especializada em Recuperação e Estímulo à Saúde Avançada.

App mobile React Native (Expo) para acompanhamento de cicatrização integrado
ao equipamento biomédico ESP32-C3 **TERESA01**, com perfis para Médico(a),
paciente **monitorado** (usa o equipamento) e paciente **autônomo** (só análise
fotográfica da ferida).

## Stack
- **Frontend**: Expo SDK 54, expo-router, TypeScript, React Native SVG,
  react-native-keyboard-controller, **react-native-ble-plx**, expo-camera /
  expo-image-picker, **expo-print + expo-sharing** (PDF), expo-linking (WhatsApp).
- **Backend**: FastAPI + Motor (async MongoDB) + bcrypt + PyJWT.
- **IA**: Emergent LLM Key → GPT-5.2 vision (via `emergentintegrations`) para
  análise de feridas; não é diagnóstico.
- **Hardware**: ESP32-C3 anunciando `TERESA01`, firmware Arduino não é alterado.

## Perfis & RBAC
| Role                   | Capacidades principais                                                           |
|------------------------|----------------------------------------------------------------------------------|
| `doctor`               | Cria/vincula pacientes, lista próprios pacientes, envia avisos, dá feedback★.    |
| `patient_monitored`    | Conecta ao TERESA01 (BLE), vê temp/umidade/estado reais, câmera, histórico, alertas, calendário. |
| `patient_autonomous`   | Só análise fotográfica da ferida, calendário, alertas, perfil. Sem BLE/temp/humidade. |

Migração automática na startup: `role="patient"` → `role="patient_monitored"`.

## Protocolo BLE (adaptado ao firmware)
Todas as constantes vivem em `frontend/src/services/ble.ts`:

```ts
TARGET_DEVICE_NAME     = 'TERESA01'
TERESA_SERVICE_UUID    = '7b4c0001-7f9d-4a2e-9d7c-6f3e2a1b0001'
TERESA_TELEMETRY_CHAR  = '7b4c0002-7f9d-4a2e-9d7c-6f3e2a1b0001'   // NOTIFY+READ
TERESA_COMMAND_CHAR    = '7b4c0003-7f9d-4a2e-9d7c-6f3e2a1b0001'   // WRITE (não enviado nesta fase)
```

Payload de telemetria exato (1 Hz enquanto conectado):
```
TEMP=36.8;HUM=52.4;STATE=EM_TRATAMENTO
```

Estados reconhecidos (iguais ao firmware):
`AGUARDANDO_BRACELETE | AGUARDANDO_INICIO | AQUECENDO | EM_TRATAMENTO | TRATAMENTO_INTERROMPIDO | TRATAMENTO_FINALIZADO`

Conexão só vira "CONECTADO" após o primeiro frame válido; timeout de 10 s
sem telemetria → desconectado e tentativa de reconexão (até 5 × 3 s).

## API Backend (prefixo `/api`)

### Auth
- `POST /auth/register` (role em `doctor | patient_monitored | patient_autonomous`)
- `POST /auth/login`, `GET /auth/me`, `PATCH /auth/me`

### Sensor / Sessions / Alerts / Contacts
- `POST /readings` (aceita `state_system`), `GET /readings?range=24h|7d|30d`, `GET /readings/latest`
- `POST /sessions`, `GET /sessions`
- `POST /alerts`, `GET /alerts`, `GET /alerts/unread-count`, `POST /alerts/{id}/read`, `POST /alerts/read-all`
- `POST /contacts`, `GET /contacts`, `DELETE /contacts/{id}`

### Wound photos + AI + Feedback
- `POST /wound-photos/analyze` (GPT-5.2 vision)
- `GET /wound-photos`, `GET /wound-photos/latest`, `GET /wound-photos/{id}` (RBAC: dono ou médico vinculado)
- `POST /wound-photos/{id}/feedback` (★1-5 + comment, doctor-only + vinculado) — cria alerta automático para o paciente

### Calendar
- `GET /calendar/day/{YYYY-MM-DD}`, `GET /calendar/month/{y}/{m}`

### Doctor
- `GET /doctor/patients?linked_only=true&q=…`
- `POST /doctor/patients` (cria paciente **já vinculado**)
- `POST /doctor/patients/{id}/link` (vincula paciente existente)
- `GET /doctor/patient/{id}` / `GET /doctor/patient/{id}/data`
- `POST /doctor/patient/{id}/alert` (envia aviso ao paciente)

## Fluxos de UI
- **Login / Registro** — 3 roles (Monitorado / Autônomo / Médico(a)).
- **Home (role-dispatched)**:
  - *Monitorado*: status do sistema de aquecimento, StateBadge (6 estados), temp/umidade (BLE live quando conectado), câmera IA, alertas, contatos (WhatsApp).
  - *Autônomo*: info card, câmera IA, alertas, contatos — SEM temp/umidade/BLE.
  - *Médico*: dropdown "Selecionar paciente" → cards do paciente (header, metrics se monitorado, última análise, estatísticas, botão "Enviar aviso").
- **Perfil**:
  - *Paciente*: dados clínicos, healing gauge, histórico, contatos.
  - *Médico*: cabeçalho + "Meus pacientes" com busca e botão **+** → modal "Adicionar paciente" (Monitorado/Autônomo + nome + e-mail + senha + idade + lesão).
- **Análise da ferida**:
  - Pacientes/médicos: foto + gauge + métricas + observações IA.
  - *Médico*: formulário de feedback ★1-5 + comentário (`POST /wound-photos/{id}/feedback`).
  - *Paciente*: vê feedback (★ e comentário) quando existir.
- **Enviar aviso** (`/app/send-alert?patientId=…`): seletor de nível + título + descrição.
- **Settings**: Exportar relatório → PDF via **expo-print** (resumo + fotos recentes + stats) com Sharing.
- **Drawer ☰**: Configurações, Conectar equipamento (passo a passo BLE), Sobre, Ajuda, Política de privacidade.

## Segurança
- Senhas bcrypt, JWT 30 dias, token em Keychain/EncryptedSharedPreferences.
- Médico só vê pacientes vinculados (via `doctor_id`); endpoints `/doctor/*` são 403 para não-médicos.
- Fotos de ferida: acesso só pelo paciente dono ou médico vinculado.

## Status (iteration 4)
- 30/30 testes de backend passam.
- Parser `parseTeresaTelemetry` cobre casos válidos / vazios / inválidos / estado desconhecido.
- Fluxos de frontend validados visualmente para os 3 roles.
- BLE real precisa de **Development Build / Production Build** nativo (Publish do Emergent).
