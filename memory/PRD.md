# T.E.R.E.S.A. — Product Requirements Document

## Nome do produto
**T.E.R.E.S.A.** — Tecnologia Especializada em Recuperação e Estímulo à Saúde Avançada.

App mobile React Native (Expo) para acompanhamento de cicatrização e monitoramento
ambiental de um equipamento biomédico baseado em ESP32 com fotobiomodulação LED / IR.

## Público
- Pacientes em tratamento de feridas crônicas.
- Médicos e enfermeiros acompanhando pacientes.

## Stack
- **Frontend**: Expo SDK 54, expo-router (file-based), TypeScript, React Native SVG, react-native-keyboard-controller, react-native-ble-plx, expo-camera / expo-image-picker.
- **Backend**: FastAPI + Motor (async MongoDB) + bcrypt + PyJWT.
- **IA**: Emergent LLM Key → GPT-5.2 vision (via `emergentintegrations`) para análise de feridas.
- **Storage**: MongoDB (users, readings, sessions, alerts, contacts, wound_photos).
- **Auth**: JWT bearer, senhas com bcrypt, token armazenado com `expo-secure-store` (Keychain / EncryptedSharedPreferences).

## Identidade visual
Palette: `#FFFFFF · #E6F0FF · #9CC6FF · #2D6CDF · #0D47A1` (inspirada nas vestes de Madre Teresa).
Muito espaço em branco, cantos arredondados, cards suaves, tipografia iOS/System.

## Fluxo do usuário
1. **Login / Registro** (paciente ou médico) — JWT.
2. **Home** — cards de temperatura/umidade, gráfico linear (24h/7d/30d), botão circular câmera + IA para análise da ferida, gauge circular de cicatrização, alertas rápidos, contatos rápidos.
3. **Calendário** — grid mensal com dots coloridos (azul=sessão, verde=boa evolução, amarelo=observação, vermelho=alerta) + resumo do dia selecionado.
4. **Avisos** — lista de alertas (info/warning/critical/success) com badge não-lidos.
5. **Perfil** — modos Paciente (dados clínicos, healing, fotos, contatos) e Médico (busca + lista de pacientes + dados). Editável via bottom sheet.
6. **Drawer** (☰): Configurações, Conectar equipamento (passo a passo BLE), Sobre, Ajuda, Política de privacidade.
7. **Análise da ferida** — tela completa com foto, gauge circular, métricas clínicas, observações da IA e disclaimer.

## API (FastAPI, prefixo /api)
- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PATCH /auth/me`
- `POST/GET /readings`, `GET /readings/latest`
- `POST/GET /sessions`
- `POST/GET /alerts`, `GET /alerts/unread-count`, `POST /alerts/{id}/read`, `POST /alerts/read-all`
- `POST/GET/DELETE /contacts`
- `POST /wound-photos/analyze`, `GET /wound-photos`, `GET /wound-photos/latest`
- `GET /calendar/day/{YYYY-MM-DD}`, `GET /calendar/month/{y}/{m}`
- `GET /doctor/patients`, `GET /doctor/patient/{id}`

## BLE (ESP32)
- Serviço UUID: `6e400001-b5a3-f393-e0a9-e50e24dcca9e` (Nordic UART-like).
- Telemetria: `6e400003-...` (JSON com temperature, humidity, time_remaining, LED/IR intensity, battery, status).
- Comandos: `6e400002-...` (start / pause / stop / set intensities / sync time / request report).
- Camada desacoplada em `/src/services/ble.ts` — lazy-load do `BleManager`. Não crasha em Expo Go/web; requer build nativo para funcionar de fato (informado ao usuário na UI).

## Segurança
- Senhas bcrypt, JWT com expiração de 30 dias.
- Token no Keychain iOS / EncryptedSharedPreferences Android via `expo-secure-store`.
- Todas as rotas (exceto register/login) protegidas por dependência `get_current_user`.
- CORS aberto (dev) — restringir em produção.

## Status
✅ MVP funcional end-to-end (menos BLE real que requer build nativo).
