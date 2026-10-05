# 📄 Relatório Técnico — T.E.R.E.S.A.

**Tecnologia Especializada em Recuperação e Estímulo à Saúde Avançada**

> Aplicativo móvel para monitoramento clínico de equipamento biomédico vestível de cicatrização.

---

## 1. Visão geral do produto

O **T.E.R.E.S.A.** é um sistema integrado composto por:

1. **Equipamento biomédico vestível** — placa **ESP32-C3 Mini** com sensores
   de temperatura (MLX90614 IR + AHT10) e umidade (AHT10), que estimula a
   cicatrização de feridas através de aquecimento controlado e emite
   telemetria contínua via **Bluetooth Low Energy (BLE)**.
2. **Aplicativo móvel multiplataforma** (iOS e Android) construído em
   **React Native (Expo SDK 57)** que atua como companion app do equipamento:
   recebe a telemetria em tempo real, exibe o estado do tratamento, armazena
   histórico, permite análise fotográfica da ferida por **IA (visão
   computacional)** e orquestra a comunicação entre médico e paciente.
3. **Serviço backend** em **FastAPI + MongoDB** que persiste leituras,
   sessões de tratamento, fotos de ferida, análises de IA, alertas e
   relacionamentos médico-paciente.

### 1.1 Três perfis de usuário (RBAC)
| Perfil | Capacidades principais |
|---|---|
| **Médico(a)** (`doctor`) | Cria/vincula pacientes, acompanha telemetria e evolução de todos os seus pacientes, dá feedback clínico nas análises de IA, envia avisos. |
| **Paciente monitorado** (`patient_monitored`) | Usa o equipamento TERESA01 via BLE, visualiza temperatura/umidade/estado em tempo real, histórico, análise fotográfica, alertas, calendário. |
| **Paciente autônomo** (`patient_autonomous`) | Usa apenas análise fotográfica da ferida (sem equipamento), calendário e alertas. |

---

## 2. Arquitetura técnica

```
┌─────────────────────────────────────────────────────────────────┐
│                     ESP32-C3 Mini (TERESA01)                    │
│  AHT10 (T/U) + MLX90614 (T IR) + Peltier/LED (atuação)          │
│  BLE GATT Server · payload: TEMP=X;HUM=Y;STATE=Z (1 Hz)         │
└────────────────────────────┬────────────────────────────────────┘
                             │ BLE 4.2 LE
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│      App Móvel (React Native · Expo SDK 57 · TypeScript)        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  bleService (react-native-ble-plx 3.5.1)                 │   │
│  │  - scan filtrado por nome TERESA01                       │   │
│  │  - subscribe NOTIFY na char de telemetria                │   │
│  │  - parser do payload TEMP=/HUM=/STATE=                   │   │
│  │  - reconexão automática (10 tentativas · 3 s backoff)    │   │
│  │  - diagnóstico (RX/INFO/WARN/ERROR) para auditoria       │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  apiClient (fetch + JWT em SecureStore)                  │   │
│  │  AuthContext (login/register/me/update)                  │   │
│  │  Expo Router (file-based navigation · typed routes)      │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTPS /api/*
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│          Backend FastAPI (Python 3.11 · Motor async)            │
│  - JWT (PyJWT) + bcrypt                                         │
│  - CORS · HTTPBearer                                            │
│  - Emergent LLM Key → GPT-5.2 vision (análise de ferida)        │
│  - Endpoints /api/auth, /readings, /sessions, /alerts, …        │
└────────────────────────────┬────────────────────────────────────┘
                             │ Mongo Wire
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              MongoDB (coleções: users, readings,                │
│          sessions, alerts, wound_photos, wound_feedback)        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Stack e dependências

### 3.1 Frontend
| Camada | Tecnologia | Versão |
|---|---|---|
| Runtime | React Native (Hermes) | 0.86.3 |
| Framework | Expo | SDK 57 |
| Linguagem | TypeScript | 5.9+ |
| Navegação | expo-router (file-based) | ~57.0.24 |
| BLE | react-native-ble-plx | 3.5.1 |
| Câmera | expo-camera | ~17.0 |
| Imagens | expo-image, expo-image-picker | ~3.0 / ~17.0 |
| Teclado | react-native-keyboard-controller | ~1.19 |
| Secure storage | expo-secure-store | ~15.0 |
| Gráficos | react-native-svg (desenho manual de linechart) | ~16.0 |
| PDF | expo-print + expo-sharing | ~14.0 / ~14.0 |
| State | React Context API + Hooks locais | — |

### 3.2 Backend
| Camada | Tecnologia |
|---|---|
| Framework | FastAPI (ASGI) |
| ODM assíncrono | Motor (async MongoDB driver) |
| Autenticação | PyJWT + bcrypt |
| Validação | Pydantic v2 |
| IA de visão | `emergentintegrations` → GPT-5.2 vision |
| Env management | python-dotenv |

### 3.3 Hardware
| Componente | Função |
|---|---|
| ESP32-C3 Mini | MCU com rádio BLE 4.2 LE |
| AHT10 (I²C) | Temperatura + umidade do bracelete |
| MLX90614 (I²C) | Temperatura infravermelha da ferida |
| Módulo Peltier / LED IR | Atuação terapêutica |

---

## 4. Estrutura de pastas

```
/app
├── backend/
│   ├── server.py              # FastAPI (1011 linhas · todos os endpoints)
│   ├── requirements.txt
│   └── .env                   # MONGO_URL, JWT_SECRET, EMERGENT_LLM_KEY
│
├── frontend/
│   ├── app/                   # Rotas (file-based · expo-router)
│   │   ├── _layout.tsx        # Root providers (Auth, Keyboard, SafeArea)
│   │   ├── index.tsx          # Entry/redirect
│   │   ├── login.tsx          # Tela de login
│   │   ├── register.tsx       # Tela de cadastro (com seletor de role)
│   │   └── (app)/             # Rotas autenticadas
│   │       ├── _layout.tsx    # Guard de autenticação + Drawer
│   │       ├── about.tsx
│   │       ├── connect.tsx    # Scan + conexão BLE + diagnóstico (588 ln)
│   │       ├── help.tsx
│   │       ├── privacy.tsx
│   │       ├── send-alert.tsx # Médico envia aviso ao paciente
│   │       ├── settings.tsx   # Preferências + export PDF
│   │       ├── wound-analysis.tsx  # Resultado da IA + feedback médico
│   │       └── (tabs)/        # Tabs principais (role-aware)
│   │           ├── _layout.tsx
│   │           ├── home.tsx   # Home com 3 variantes por role (1136 ln)
│   │           ├── calendar.tsx    # Timeline mensal/diária
│   │           ├── notices.tsx     # Lista de alertas
│   │           └── profile.tsx     # Perfil + Meus pacientes (médico)
│   │
│   ├── src/
│   │   ├── components/        # UI reusable
│   │   │   ├── AppDrawer.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── CircularProgress.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── LineChart.tsx       # Gráfico SVG custom
│   │   │   ├── PrimaryButton.tsx
│   │   │   ├── SegmentedControl.tsx
│   │   │   ├── StateBadge.tsx      # Badge do estado do ESP32
│   │   │   ├── Toast.tsx
│   │   │   └── TopBar.tsx
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx     # JWT + usuário atual (100 ln)
│   │   ├── services/
│   │   │   ├── api.ts              # Cliente HTTP + tipos (196 ln)
│   │   │   └── ble.ts              # Serviço BLE completo (699 ln)
│   │   ├── theme/
│   │   │   └── tokens.ts           # Design tokens (cores/spacing/type)
│   │   ├── utils/storage/
│   │   │   ├── index.ts            # Wrapper SecureStore (nativo)
│   │   │   └── index.web.ts        # Fallback localStorage (web)
│   │   └── hooks/
│   │       └── use-icon-fonts.ts
│   │
│   ├── app.json               # Permissões iOS/Android + plugins
│   ├── package.json
│   └── tsconfig.json
│
├── BLE_BENCH_TEST.md          # Roteiro de teste físico
├── ESP32_FIRMWARE.md          # Especificação do firmware (congelado)
└── memory/
    ├── PRD.md                 # Product Requirements Document
    └── test_credentials.md
```

---

## 5. Protocolo de comunicação BLE

### 5.1 Constantes do firmware (congeladas)

```ts
// /app/frontend/src/services/ble.ts
export const TARGET_DEVICE_NAME    = 'TERESA01';
export const TERESA_SERVICE_UUID   = '7b4c0001-7f9d-4a2e-9d7c-6f3e2a1b0001';
export const TERESA_TELEMETRY_CHAR = '7b4c0002-7f9d-4a2e-9d7c-6f3e2a1b0001'; // NOTIFY + READ
export const TERESA_COMMAND_CHAR   = '7b4c0003-7f9d-4a2e-9d7c-6f3e2a1b0001'; // WRITE (reservado)
```

### 5.2 Payload de telemetria

O ESP32 envia um frame **a cada ~1 segundo** enquanto houver cliente conectado,
na forma de string ASCII:

```
TEMP=36.8;HUM=52.4;STATE=EM_TRATAMENTO
```

### 5.3 Máquina de estados do equipamento

```
AGUARDANDO_BRACELETE → AGUARDANDO_INICIO → AQUECENDO → EM_TRATAMENTO
                                                            ↓
                              TRATAMENTO_INTERROMPIDO ← ──┤
                              TRATAMENTO_FINALIZADO ← ────┘
```

### 5.4 Parser (lado do app)

```ts
export function parseTeresaTelemetry(raw: string): TeresaTelemetry | null {
  if (!raw || typeof raw !== 'string') return null;
  const map = new Map<string, string>();
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim().toUpperCase();
    const value = part.slice(eq + 1).trim();
    if (key) map.set(key, value);
  }
  const tempStr = map.get('TEMP');
  const humStr  = map.get('HUM');
  const stateStr = (map.get('STATE') ?? '').toUpperCase();
  if (!tempStr || !humStr) return null;
  const temperature_c = parseFloat(tempStr);
  const humidity_pct  = parseFloat(humStr);
  if (!Number.isFinite(temperature_c) || !Number.isFinite(humidity_pct)) return null;
  const state = (KNOWN_STATES as readonly string[]).includes(stateStr)
    ? (stateStr as TreatmentState)
    : 'DESCONHECIDO';
  return { temperature_c, humidity_pct, state, received_at: new Date().toISOString() };
}
```

### 5.5 Estados da conexão (lado do app)

```ts
export type ConnectionState =
  | 'disconnected'   // nenhum vínculo
  | 'scanning'       // escaneando no ar
  | 'connecting'     // link TCP-like estabelecido, aguardando 1º frame
  | 'connected'      // link + telemetria válida fluindo
  | 'reconnecting'   // tentativa automática em curso
  | 'bt_off'         // rádio Bluetooth desligado no celular
  | 'unauthorized'   // permissão BLE negada pelo usuário
  | 'error';         // falha genérica
```

### 5.6 Estratégia de reconexão

- **Buffer de telemetria timeout:** se 10 s sem frame válido ⇒ assume desconexão.
- **Reconexão automática:** até **10 tentativas** com backoff de 3 s.
- **Reset do contador:** ao receber o 1º frame válido (= conectado de verdade).
- **Diagnóstico:** 40 últimas entradas (RX/INFO/WARN/ERROR) expostas na UI para auditoria.

> ⚠️ A UI considera "conectado" **apenas** quando o 1º frame válido chega. O vínculo
> BLE puro não é suficiente — isso evita falsos positivos quando a característica NOTIFY
> ainda não foi inscrita.

---

## 6. Modelos de dados (Pydantic / TypeScript)

### 6.1 Usuário

```python
class UserPublic(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: Literal['doctor', 'patient_monitored', 'patient_autonomous']
    photo_base64: Optional[str] = None
    doctor_id: Optional[str] = None
    # paciente
    age: Optional[int]
    sex: Optional[str]
    lesion_type: Optional[str]
    lesion_location: Optional[str]
    diabetes: Optional[bool]
    hypertension: Optional[bool]
    allergies: Optional[str]
    medications: Optional[str]
    treatment_start: Optional[str]
    # médico
    crm: Optional[str]
    specialty: Optional[str]
    hospital: Optional[str]
    phone: Optional[str]
    created_at: str
```

### 6.2 Leitura (telemetria persistida)

```python
class Reading(BaseModel):
    id: str
    user_id: str
    temperature_c: float
    humidity_pct: float
    state_system: Optional[str] = None   # valor STATE= do ESP32
    timestamp: str
```

### 6.3 Análise de ferida (saída da IA)

```python
class WoundAnalysisResult(BaseModel):
    estimated_area_cm2: float
    predominant_color: str
    inflammation_level: Literal['low', 'medium', 'high']
    granulation_quality: Literal['poor', 'fair', 'good', 'excellent']
    evolution: Literal['worsening', 'stable', 'improving', 'well_healing']
    estimated_days_remaining: int
    healing_percentage: int   # 0-100
    notes: str
```

### 6.4 Alerta clínico

```python
class Alert(BaseModel):
    id: str
    user_id: str
    level: Literal['info', 'warning', 'critical', 'success']
    title: str
    description: str
    category: Literal['system', 'device', 'medical', 'environmental', 'update', 'protocol']
    read: bool = False
    sender_id: Optional[str] = None   # id do médico (se aplicável)
    sender_name: Optional[str] = None
    timestamp: str
```

---

## 7. Endpoints da API

| Verbo | Rota | Perfil | Função |
|---|---|---|---|
| POST | `/api/auth/register` | público | Cadastro |
| POST | `/api/auth/login` | público | Login (retorna JWT) |
| GET | `/api/auth/me` | auth | Dados do usuário atual |
| PATCH | `/api/auth/me` | auth | Atualizar perfil |
| POST | `/api/readings` | paciente | Enviar 1 leitura BLE |
| GET | `/api/readings?range=24h\|7d\|30d` | auth | Histórico (até 2000 registros) |
| GET | `/api/readings/latest` | auth | Última leitura |
| POST | `/api/sessions` | paciente | Registrar sessão de tratamento |
| GET | `/api/sessions` | auth | Lista de sessões |
| POST | `/api/wound-photos` | paciente | Enviar foto da ferida (base64) |
| POST | `/api/wound-photos/{id}/analyze` | auth | Dispara IA de visão |
| GET | `/api/wound-photos` | auth | Histórico de análises |
| POST | `/api/wound-photos/{id}/feedback` | médico | Dar nota + comentário clínico |
| POST | `/api/alerts` | auth | Criar alerta |
| GET | `/api/alerts` | auth | Lista de alertas |
| PATCH | `/api/alerts/{id}/read` | auth | Marcar como lido |
| GET | `/api/calendar/day/{YYYY-MM-DD}` | auth | Resumo diário |
| GET | `/api/calendar/month/{Y}/{M}` | auth | Marcadores do mês |
| GET | `/api/doctor/patients` | médico | Lista pacientes vinculados |
| POST | `/api/doctor/patients` | médico | Criar paciente + vincular |
| POST | `/api/doctor/patients/{id}/link` | médico | Vincular paciente existente |
| GET | `/api/doctor/patients/{id}/full` | médico | Dossiê completo do paciente |
| POST | `/api/doctor/patients/{id}/alerts` | médico | Enviar aviso ao paciente |

**Autenticação:** JWT HS256 no header `Authorization: Bearer <token>`, expiração configurável via `JWT_EXPIRES_HOURS`.

---

## 8. Fluxos principais da aplicação

### 8.1 Paciente monitorado — ciclo completo

```
1. Login → AuthContext guarda JWT em SecureStore
2. Home exibe card "Sistema de aquecimento" (status BLE)
3. Toca em "Conectar" → tela /connect
4. bleService.startScan() → filtra por nome 'TERESA01'
5. Device encontrado (RSSI exibido) → toca "Conectar"
6. bleService.connect(id):
   a. connectToDevice()
   b. discoverAllServicesAndCharacteristics()
   c. onDeviceDisconnected() subscriber
   d. monitorCharacteristicForService(SERVICE, TELEMETRY)
7. 1º frame → parseTeresaTelemetry() → estado = 'connected'
8. UI atualiza a cada ~1 s com temperatura/umidade/estado
9. A cada 30 s → POST /api/readings (histórico)
10. Perda de sinal → scheduleReconnect() (10 tentativas · 3 s backoff)
```

### 8.2 Análise de ferida com IA

```
1. Paciente toca "+ Nova foto" na Home
2. Expo Camera / Image Picker → base64
3. POST /api/wound-photos
4. POST /api/wound-photos/{id}/analyze
5. Backend chama GPT-5.2 vision via emergentintegrations
6. Retorna WoundAnalysisResult (área, cor, inflamação, granulação,
   evolução, dias restantes estimados, % cicatrização, notas)
7. UI mostra CircularProgress com %, badges coloridos por nível
8. Médico vinculado recebe acesso e pode:
   - Dar rating 1-5 ★
   - Escrever comentário clínico
   - POST /api/wound-photos/{id}/feedback
   - Paciente recebe alert.category='medical' automaticamente
```

### 8.3 Fluxo médico — gestão de pacientes

```
1. Médico loga → Home exibe "Meus pacientes" (lista com stats)
2. Toca em paciente → dossiê completo:
   - Última leitura BLE (se monitorado)
   - Gráfico de temperatura/umidade (24h / 7d / 30d)
   - Lista de fotos + análises
   - Sessões de tratamento
   - Alertas recentes
3. "Enviar aviso" → modal → POST /api/doctor/patients/{id}/alerts
4. "+ Novo paciente" → cria usuário + vincula automaticamente
```

---

## 9. Trechos de código representativos

### 9.1 Core do serviço BLE (ciclo de conexão)

```ts
async connect(deviceId: string): Promise<void> {
  if (!this.isAvailable()) return;
  this.stopScan();
  this.reconnectAttempts = 0;
  this.lastConnectedDeviceId = deviceId;
  await this.performConnect(deviceId);
}

private async performConnect(deviceId: string): Promise<void> {
  this.setState('connecting');
  try {
    await this.cleanupConnection();
    const device = await this.manager.connectToDevice(deviceId, { requestMTU: 185 });
    await device.discoverAllServicesAndCharacteristics();
    this.connectedDevice = device;
    this.disconnectSubscription = this.manager.onDeviceDisconnected(
      deviceId, (error: any) => this.handleDisconnect()
    );
    this.subscribeTelemetry();
    // UI segue em 'connecting' até o 1º frame válido chegar
  } catch (e: any) {
    this.diag('error', `Falha ao conectar: ${e?.message ?? e}`);
    this.setState('error');
    this.scheduleReconnect();
  }
}

private subscribeTelemetry(): void {
  this.telemetrySubscription = this.connectedDevice.monitorCharacteristicForService(
    TERESA_SERVICE_UUID,
    TERESA_TELEMETRY_CHAR,
    (error: any, char: any) => {
      if (error || !char?.value) return;
      const raw = decodeBase64(char.value);
      const parsed = parseTeresaTelemetry(raw);
      if (!parsed) return;
      this.lastTelemetry = parsed;
      this.framesReceived += 1;
      this.lastFrameAt = parsed.received_at;
      this.setState('connected');
      this.reconnectAttempts = 0;
      this.telemetryListeners.forEach((fn) => fn(parsed));
      this.armTelemetryTimeout();  // 10s watchdog
    },
  );
}
```

### 9.2 Autenticação JWT (backend)

```python
def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRES_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(creds = Depends(security)) -> dict:
    if creds is None:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
```

### 9.3 Context de autenticação (frontend)

```tsx
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await loadToken();          // SecureStore
      if (t) {
        try {
          const u = await api.get<User>('/auth/me');
          setUser(u); setToken(t);
        } catch { await clearToken(); }
      }
      setLoading(false);
    })();
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post<{token: string, user: User}>(
      '/auth/login', { email, password }, false
    );
    await saveToken(res.token);
    setToken(res.token); setUser(res.user);
  }
  // ...
}
```

### 9.4 Design tokens (identidade visual)

```ts
export const colors = {
  primary: '#2D6CDF',       // azul médico
  primaryDark: '#0D47A1',
  primarySoft: '#E6F0FF',
  bg: '#F8FBFF',            // off-white limpo
  surface: '#FFFFFF',
  textPrimary: '#0A1930',
  textSecondary: '#64748B',
  greenGood: '#10B981',     // conectado / bom
  yellowObserve: '#F59E0B', // atenção / reconectando
  redAlert: '#EF4444',      // crítico / desconectado
};

export const typography = {
  h1:      { fontSize: 34, fontWeight: '700', lineHeight: 41 },
  h4:      { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  body:    { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  metric:  { fontSize: 44, fontWeight: '700', lineHeight: 52 }, // valores grandes
};
```

### 9.5 Permissões declaradas (`app.json`)

```json
{
  "ios": {
    "infoPlist": {
      "NSBluetoothAlwaysUsageDescription": "Conectar ao equipamento T.E.R.E.S.A.",
      "NSBluetoothPeripheralUsageDescription": "Conectar ao equipamento T.E.R.E.S.A.",
      "UIBackgroundModes": ["bluetooth-central"],
      "NSCameraUsageDescription": "Fotografar feridas para análise clínica",
      "NSPhotoLibraryUsageDescription": "Selecionar fotos da ferida para análise"
    }
  },
  "android": {
    "permissions": [
      "android.permission.BLUETOOTH",
      "android.permission.BLUETOOTH_ADMIN",
      "android.permission.BLUETOOTH_CONNECT",
      "android.permission.BLUETOOTH_SCAN",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.CAMERA",
      "android.permission.READ_MEDIA_IMAGES"
    ]
  },
  "plugins": [
    ["react-native-ble-plx", {
      "isBackgroundEnabled": true,
      "modes": ["central"],
      "bluetoothAlwaysPermission": "Conectar ao equipamento T.E.R.E.S.A."
    }]
  ]
}
```

---

## 10. Segurança e privacidade

| Vetor | Mitigação |
|---|---|
| **Senhas** | bcrypt (salt automático · fator 12 default) |
| **Sessão** | JWT HS256 · expiração configurável · armazenado em SecureStore (iOS Keychain / Android KeyStore) |
| **Autorização** | Middleware `get_current_user` + guards `require_doctor` e `assert_doctor_owns_patient` |
| **CORS** | Allowed origins restrito ao domínio da aplicação |
| **Dados sensíveis** | Fotos de ferida armazenadas como base64 associadas ao `user_id`; apenas o paciente e o médico vinculado podem ler |
| **Transporte** | HTTPS obrigatório em produção (Kubernetes ingress) |
| **BLE** | Conexão 1:1 com o dispositivo específico `TERESA01`; firmware do ESP32 não aceita escrita de comandos nesta fase (característica de WRITE reservada) |

---

## 11. Volumetria e escala (parâmetros)

| Métrica | Valor |
|---|---|
| Frequência de telemetria BLE | 1 Hz |
| Persistência no backend | 1 leitura a cada 30 s |
| Limite por consulta `/readings` | 2000 registros |
| Timeout de reconexão | 10 s sem frame |
| Backoff de reconexão | 3 s |
| Máximo de tentativas | 10 |
| Buffer de diagnóstico | 40 entradas |
| MTU BLE requisitado | 185 bytes |

---

## 12. Status atual e roadmap

### ✅ Entregue (iteração 6)
- Autenticação JWT com 3 perfis (RBAC completo)
- Conexão BLE real com ESP32-C3 (parser 100% aderente ao firmware)
- Reconexão automática com 10 tentativas + diagnóstico em UI
- Análise fotográfica via IA (GPT-5.2 vision)
- Feedback clínico médico → paciente
- Calendário mensal/diário
- Alertas bidirecionais
- Export PDF (relatórios clínicos)
- Expo SDK 57 (compatibilidade iOS/Android atual)

### 🔄 Em validação
- Teste físico de bancada com ESP32-C3 real (roteiro em `BLE_BENCH_TEST.md`)

### 📋 Backlog
- Exportação CSV do histórico BLE
- Alertas automáticos por limite de temperatura
- Cache offline das últimas leituras
- Dashboard do médico com gráficos de evolução comparativa

---

## 13. Referências

- Expo SDK 57: https://docs.expo.dev
- react-native-ble-plx: https://github.com/dotintent/react-native-ble-plx
- FastAPI: https://fastapi.tiangolo.com
- Motor (async MongoDB): https://motor.readthedocs.io
- Apple Human Interface Guidelines (base da identidade visual)
- Firmware do ESP32-C3: consultar `/app/ESP32_FIRMWARE.md`

---

*Documento gerado automaticamente a partir do código em produção (iteração 6, Expo SDK 57).*
