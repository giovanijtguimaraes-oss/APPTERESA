# T.E.R.E.S.A. — Integração BLE com ESP32 Mini

Este documento é a especificação técnica que o firmware do ESP32 precisa
seguir para se comunicar corretamente com o aplicativo T.E.R.E.S.A.

> ⚠️ O BLE real **não funciona no Expo Go**. Para testar com o ESP32 físico,
> é preciso publicar o app pelo botão **Publish** (canto superior direito)
> e gerar um **Development Build** ou **Production Build** iOS/Android.

---

## 1. Nome BLE do dispositivo

O ESP32 **deve** anunciar (`BLEDevice::init`) com o nome:

```
TERESA01
```

O app filtra a varredura BLE e só surfaces dispositivos cujo `advertised name`
começa com `TERESA01` (case-insensitive). Nomes tipo `TERESA01_ABC` também
são aceitos, mas devem começar com `TERESA01`.

---

## 2. UUIDs (perfil GATT)

Os UUIDs abaixo são compatíveis com o padrão **Nordic UART**. Se você
mantiver esses valores no firmware **não é preciso** alterar nada no app.

| Elemento               | UUID                                    | Propriedade    |
|------------------------|-----------------------------------------|----------------|
| Serviço                | `6e400001-b5a3-f393-e0a9-e50e24dcca9e`  | —              |
| Characteristic Telemetria | `6e400003-b5a3-f393-e0a9-e50e24dcca9e` | **NOTIFY**     |
| Characteristic Comandos   | `6e400002-b5a3-f393-e0a9-e50e24dcca9e` | **WRITE**      |

Se seu firmware usar outros UUIDs, altere **apenas** os três constantes no
arquivo `/app/frontend/src/services/ble.ts`:

```ts
export const TARGET_DEVICE_NAME = 'TERESA01';
export const TERESA_SERVICE_UUID   = '...';
export const TERESA_TELEMETRY_CHAR = '...';
export const TERESA_COMMAND_CHAR   = '...';
```

Nada mais no app precisa ser mudado.

---

## 3. Formato da telemetria (ESP32 → App)

O ESP32 envia notificações via `TERESA_TELEMETRY_CHAR` contendo **JSON UTF-8**
com **pelo menos** os campos de temperatura, umidade e status.

Exemplo mínimo obrigatório:

```json
{"temperature_c": 37.4, "humidity_pct": 52, "status": "ON"}
```

Campos aceitos (o parser é flexível — case/naming variantes suportadas):

| Campo                    | Aliases aceitos                                | Tipo    | Obrigatório |
|--------------------------|------------------------------------------------|---------|-------------|
| `temperature_c`          | `temperature`, `TEMPERATURE`, `temp`           | number  | **sim**     |
| `humidity_pct`           | `humidity`, `HUMIDITY`, `hum`                  | number  | **sim**     |
| `status`                 | `STATUS`, `session_status`                     | string  | **sim**     |
| `time_remaining_s`       | `time_remaining`                               | number  | opcional    |
| `led_intensity`          | —                                              | number  | opcional    |
| `ir_intensity`           | —                                              | number  | opcional    |
| `battery_pct`            | `battery`                                      | number  | opcional    |
| `last_error`             | —                                              | string  | opcional    |

Frequência recomendada: **1 payload a cada 1–5 s**.

O app trata o dispositivo como **desconectado** se não receber nenhuma
telemetria por **30 s** (mesmo que o link BLE ainda esteja aberto).

---

## 4. Formato dos comandos (App → ESP32)

Comandos são gravados como JSON UTF-8 na characteristic `TERESA_COMMAND_CHAR`.
O ESP32 deve interpretar o campo `type`:

| Comando enviado pelo app             | Ação esperada no firmware                  |
|--------------------------------------|--------------------------------------------|
| `{"type":"start_session"}`           | Inicia a sessão de fotobiomodulação        |
| `{"type":"pause_session"}`           | Pausa a sessão atual                       |
| `{"type":"stop_session"}`            | Encerra a sessão                           |
| `{"type":"set_led_intensity","value":75}` | Ajusta intensidade do LED (0–100 %)    |
| `{"type":"set_ir_intensity","value":50}`  | Ajusta intensidade do infravermelho    |
| `{"type":"set_protocol","id":"P1"}`  | Troca de protocolo                         |
| `{"type":"sync_time","iso":"2026-..."}` | Sincroniza relógio interno              |
| `{"type":"request_report"}`          | Retorna um relatório (telemetria estendida)|

---

## 5. Exemplo mínimo de código Arduino (esboço)

```cpp
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <ArduinoJson.h>
#include <Adafruit_MLX90614.h>

#define SERVICE_UUID           "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define TELEMETRY_CHAR_UUID    "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
#define COMMAND_CHAR_UUID      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"

Adafruit_MLX90614 mlx = Adafruit_MLX90614();
BLECharacteristic *telemetryChar;
BLECharacteristic *commandChar;
bool clientConnected = false;

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *s)    override { clientConnected = true;  }
  void onDisconnect(BLEServer *s) override { clientConnected = false; BLEDevice::startAdvertising(); }
};

class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override {
    std::string v = c->getValue();
    // Parse JSON and dispatch:
    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, v) == DeserializationError::Ok) {
      const char *type = doc["type"];
      // handle start_session / pause_session / etc.
      Serial.printf("cmd: %s\n", type);
    }
  }
};

void setup() {
  Serial.begin(115200);
  mlx.begin();

  BLEDevice::init("TERESA01");                     // <-- nome exigido
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService *service = server->createService(SERVICE_UUID);

  telemetryChar = service->createCharacteristic(
      TELEMETRY_CHAR_UUID,
      BLECharacteristic::PROPERTY_NOTIFY);
  telemetryChar->addDescriptor(new BLE2902());

  commandChar = service->createCharacteristic(
      COMMAND_CHAR_UUID,
      BLECharacteristic::PROPERTY_WRITE);
  commandChar->setCallbacks(new CommandCallbacks());

  service->start();

  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(false);
  BLEDevice::startAdvertising();
}

void loop() {
  if (clientConnected) {
    float temperature = mlx.readObjectTempC();
    float humidity    = 55.0;  // ex: DHT22 aqui
    StaticJsonDocument<128> doc;
    doc["temperature_c"] = temperature;
    doc["humidity_pct"]  = humidity;
    doc["status"]        = "ON";
    char payload[128];
    size_t n = serializeJson(doc, payload);
    telemetryChar->setValue((uint8_t *)payload, n);
    telemetryChar->notify();
  }
  delay(2000);
}
```

---

## 6. Fluxo esperado (checklist de aceitação)

1. ESP32 ligado → anuncia com nome `TERESA01`.
2. Usuário abre o app → menu ☰ → **Conectar equipamento** → **Buscar dispositivos**.
3. Após ~2 s o `TERESA01` aparece na lista.
4. Toca em **Conectar** → status muda para `Conectando…`.
5. Assim que o app recebe o **primeiro payload** de telemetria válido, o
   status muda para `Conectado` (bolinha verde).
6. Home passa a exibir a **temperatura real** e a **umidade real** vindas
   do sensor MLX + sensor de umidade ligados ao ESP32.
7. A cada 30 s, o app persiste uma leitura em `/api/readings` (a mesma que
   alimenta o gráfico linear, o calendário e o histórico).
8. Se o ESP32 for desligado → o app detecta em até 30 s, muda status para
   `Desconectado` e tenta reconectar automaticamente (até 5 tentativas com
   3 s de intervalo).
9. Toque em **Desconectar** encerra a conexão e para o auto-reconnect.

---

## 7. Como testar

1. Faça flash do firmware acima (ou o seu, respeitando o formato JSON).
2. Ligue o ESP32 — deve aparecer `TERESA01` nas varreduras BLE de qualquer
   scanner (nRF Connect, LightBlue etc.).
3. No Emergent: clique **Publish** (canto superior direito).
4. Gere um build iOS ou Android (o Emergent guia pelos passos de credenciais).
5. Instale no iPhone/Android físico e teste o fluxo do item 6.

Não é possível testar BLE via Expo Go, LAN preview ou navegador web.

---

## 8. Permissões

Já configuradas em `/app/frontend/app.json`:

- **iOS** (`Info.plist`)
  - `NSBluetoothAlwaysUsageDescription`
  - `NSBluetoothPeripheralUsageDescription`
  - `UIBackgroundModes: ["bluetooth-central"]`
- **Android** (Manifest)
  - `BLUETOOTH`, `BLUETOOTH_ADMIN`
  - `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`
  - `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`

O app pede as permissões contextualmente na primeira varredura.

---

## 9. Onde tudo isso vive no código

| Responsabilidade                               | Arquivo                                             |
|------------------------------------------------|-----------------------------------------------------|
| Configuração de UUIDs + nome do dispositivo    | `frontend/src/services/ble.ts` (topo do arquivo)    |
| Serviço BLE (scan/connect/notify/write/retry)  | `frontend/src/services/ble.ts`                       |
| Tela de conexão + passo a passo                | `frontend/app/(app)/connect.tsx`                    |
| Ingestão de telemetria + persistência em backend | `frontend/app/(app)/(tabs)/home.tsx`               |
| Endpoint de readings usado pela ingestão       | `backend/server.py`  (`POST /api/readings`)         |
| Permissões nativas                             | `frontend/app.json`                                 |

Nenhum outro ponto do app precisa saber que o BLE existe — a arquitetura
está totalmente desacoplada.
