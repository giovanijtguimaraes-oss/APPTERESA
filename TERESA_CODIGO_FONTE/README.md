# 📦 T.E.R.E.S.A. — Código Fonte Completo

Pasta única com **todo o código real** do projeto T.E.R.E.S.A.
(Tecnologia Especializada em Recuperação e Estímulo à Saúde Avançada).

**Snapshot gerado em:** iteração 6 · Expo SDK 57 · ~105 arquivos.

---

## 📂 Estrutura

```
TERESA_CODIGO_FONTE/
├── backend/                          # API FastAPI (Python)
│   ├── server.py                     # ✱ 1011 linhas · todos endpoints + modelos
│   ├── requirements.txt              # dependências Python
│   ├── .env.example                  # template de variáveis (preencher)
│   └── tests/
│       ├── backend_test.py
│       └── test_limits_regression.py
│
├── frontend/                         # App Expo / React Native
│   ├── app/                          # Rotas (file-based · expo-router)
│   │   ├── _layout.tsx               # root providers (Auth, Keyboard, SafeArea)
│   │   ├── index.tsx                 # redirect inicial
│   │   ├── login.tsx                 # tela de login
│   │   ├── register.tsx              # tela de cadastro
│   │   ├── +html.tsx                 # template HTML (web)
│   │   └── (app)/                    # rotas autenticadas
│   │       ├── _layout.tsx           # guard de autenticação + Drawer
│   │       ├── about.tsx
│   │       ├── help.tsx
│   │       ├── privacy.tsx
│   │       ├── settings.tsx          # preferências + export PDF
│   │       ├── send-alert.tsx        # médico envia aviso ao paciente
│   │       ├── connect.tsx           # ✱ BLE scan/connect + diagnóstico (588 ln)
│   │       ├── wound-analysis.tsx    # análise IA + feedback médico
│   │       └── (tabs)/
│   │           ├── _layout.tsx
│   │           ├── home.tsx          # ✱ Home 3 variantes por role (1136 ln)
│   │           ├── calendar.tsx      # timeline mensal/diária
│   │           ├── notices.tsx       # lista de alertas
│   │           └── profile.tsx       # perfil + meus pacientes (médico)
│   │
│   ├── src/                          # Código reutilizável (fora de rotas)
│   │   ├── components/               # UI library
│   │   │   ├── AppDrawer.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── CircularProgress.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── LineChart.tsx         # SVG custom
│   │   │   ├── PrimaryButton.tsx
│   │   │   ├── SegmentedControl.tsx
│   │   │   ├── StateBadge.tsx        # badge do estado do ESP32
│   │   │   ├── Toast.tsx
│   │   │   └── TopBar.tsx
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx       # ✱ JWT + sessão (100 ln)
│   │   ├── services/
│   │   │   ├── api.ts                # ✱ HTTP client + tipos (196 ln)
│   │   │   └── ble.ts                # ✱✱ serviço BLE completo (699 ln)
│   │   ├── theme/
│   │   │   └── tokens.ts             # design tokens
│   │   ├── utils/storage/
│   │   │   ├── index.ts              # SecureStore nativo
│   │   │   ├── index.web.ts          # fallback localStorage
│   │   │   └── storage-base.ts
│   │   └── hooks/
│   │       └── use-icon-fonts.ts
│   │
│   ├── assets/                       # ícones, splash, imagens
│   ├── constants/                    # testIDs
│   ├── scripts/                      # scripts auxiliares (guard, shim)
│   │
│   ├── app.json                      # ✱ permissões iOS/Android + plugins
│   ├── package.json                  # dependências JS
│   ├── tsconfig.json
│   ├── metro.config.js
│   ├── eslint.config.js
│   ├── yarn.lock
│   ├── .env.example                  # template (preencher)
│   ├── .gitignore
│   └── .npmrc
│
├── docs/                             # Documentação técnica
│   ├── RELATORIO_TECNICO.md          # ✱✱ relatório completo (667 ln)
│   ├── PRD.md                        # Product Requirements Document
│   ├── BLE_BENCH_TEST.md             # roteiro de teste físico
│   ├── test_credentials.md
│   └── design_guidelines.json        # design tokens exportados
│
├── firmware/
│   └── ESP32_FIRMWARE.md             # especificação do firmware (congelado)
│
└── README.md                         # este arquivo
```

Legenda: **✱** arquivo crítico · **✱✱** arquivo mais importante

---

## 🚀 Como rodar localmente

### Backend
```bash
cd backend
cp .env.example .env   # preencha com seus valores
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend
```bash
cd frontend
cp .env.example .env   # preencha EXPO_PUBLIC_BACKEND_URL
yarn install
yarn start             # abre o Metro bundler
# aperte 'a' para Android (Expo Go) · 'i' para iOS · 'w' para web
```

> ⚠️ **BLE não funciona em Expo Go nem no preview web.** Para testar o
> módulo `react-native-ble-plx` com hardware real, é necessário gerar um
> **build nativo** (APK Android ou IPA iOS). Siga `docs/BLE_BENCH_TEST.md`.

### Pré-requisitos
| Camada | Requisito |
|---|---|
| Backend | Python 3.11+ · MongoDB 6+ (local ou Atlas) |
| Frontend | Node 20+ · Yarn 1.22+ · Expo CLI (`npm i -g expo-cli`) |
| Android | Android Studio (SDK 34+) ou físico com `.apk` sideload |
| iOS | Xcode 15+ (macOS) ou TestFlight com conta Apple Developer |
| Hardware | ESP32-C3 Mini com firmware TERESA01 carregado |

---

## 🔑 Arquivos essenciais para leitura

Ordem recomendada para quem está entendendo o projeto pela primeira vez:

1. **`docs/RELATORIO_TECNICO.md`** — visão geral completa
2. **`backend/server.py`** — modelos, endpoints, autenticação
3. **`frontend/src/services/ble.ts`** — protocolo BLE do ESP32 (coração do app)
4. **`frontend/src/services/api.ts`** — cliente HTTP e tipos TypeScript
5. **`frontend/src/contexts/AuthContext.tsx`** — gestão de sessão JWT
6. **`frontend/app/(app)/connect.tsx`** — tela de conexão BLE com diagnóstico
7. **`frontend/app/(app)/(tabs)/home.tsx`** — Home com 3 variantes por role
8. **`frontend/app.json`** — permissões iOS/Android e plugins Expo
9. **`docs/BLE_BENCH_TEST.md`** — como testar fisicamente com ESP32
10. **`firmware/ESP32_FIRMWARE.md`** — especificação do firmware (congelado)

---

## 🔒 Credenciais e segurança

Os arquivos `.env` **reais** foram **excluídos** deste snapshot por segurança.
Apenas os `.env.example` com os nomes das variáveis estão incluídos.

Variáveis necessárias:
| Variável | Camada | Finalidade |
|---|---|---|
| `MONGO_URL` | backend | string de conexão MongoDB |
| `DB_NAME` | backend | nome do database |
| `JWT_SECRET` | backend | segredo HS256 para assinar tokens |
| `JWT_ALGORITHM` | backend | `HS256` |
| `JWT_EXPIRES_HOURS` | backend | ex.: `72` |
| `EMERGENT_LLM_KEY` | backend | **opcional** · análise IA de ferida |
| `EXPO_PUBLIC_BACKEND_URL` | frontend | URL pública da API |

---

## 📝 Licença e autoria

Projeto desenvolvido com Emergent (plataforma de IA para desenvolvimento) e
hardware T.E.R.E.S.A. (ESP32-C3 Mini com firmware proprietário).

Para dúvidas sobre o código, consulte `docs/RELATORIO_TECNICO.md`.
