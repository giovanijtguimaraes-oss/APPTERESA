# T.E.R.E.S.A. — Teste Físico de Bancada (ESP32-C3 ↔ App)

Este documento descreve o procedimento completo para validar a conexão
Bluetooth Low Energy entre o aplicativo T.E.R.E.S.A. e o equipamento real
(ESP32-C3 com firmware TERESA01).

> ⚠️ **O BLE não funciona no Expo Go nem no preview web.**
> Gere um **APK (Android)** ou **IPA (iOS)** nativo pelo botão **Publish** do
> Emergent antes de iniciar este teste.

---

## 1. Pré-requisitos

### Hardware
- Placa **ESP32-C3 Mini** com firmware TERESA01 instalado (não alterar).
- Sensor **AHT10** (temperatura/umidade) e **MLX90614** (temperatura IR) soldados.
- Fonte 5 V / USB-C conectada à placa.
- Bracelete / dedo-sensor para disparar o fluxo de estados (opcional, mas recomendado).

### App
- Build nativo instalado no celular (APK Android ou IPA iOS via TestFlight / instalação manual).
- Usuário criado como **Paciente Monitorado** (`patient_monitored`) no backend.
  - Veja `/app/memory/test_credentials.md` para o fluxo de criação (médico → + paciente monitorado).

### Permissões / Rádio
| Plataforma | Pré-check obrigatório |
| --- | --- |
| **iOS** | Bluetooth ON · App com permissão de Bluetooth autorizada em Ajustes → T.E.R.E.S.A. |
| **Android 12+** | Bluetooth ON · "Dispositivos próximos" autorizado · Localização ON (não é mais obrigatória em todos os OEMs, mas alguns ainda exigem) |
| **Android < 12** | Bluetooth ON · Localização ON (necessário para scan BLE) |

Se as permissões não forem concedidas, o status na Home ficará **PERMISSÃO NEGADA**
e a tela **Conectar equipamento** mostrará um botão para abrir as Configurações.

---

## 2. Preparando o ESP32-C3

1. Energize a placa (USB-C 5 V ou fonte externa).
2. Observe o LED on-board / LED de pareamento acender.
3. Verifique no monitor serial (115200 baud) as mensagens:
   ```
   [BLE] Advertising "TERESA01"
   [BLE] Awaiting connection…
   ```
4. Confirme que, após a conexão BLE, o firmware passa a transmitir a cada ~1 s
   um pacote no formato EXATO:
   ```
   TEMP=36.8;HUM=52.4;STATE=AGUARDANDO_INICIO
   ```

> O firmware, UUIDs e protocolo estão **CONGELADOS** no app:
> - Nome BLE: `TERESA01`
> - Service UUID: `7b4c0001-7f9d-4a2e-9d7c-6f3e2a1b0001`
> - Telemetry Char: `7b4c0002-7f9d-4a2e-9d7c-6f3e2a1b0001` (NOTIFY)
> - Command Char: `7b4c0003-7f9d-4a2e-9d7c-6f3e2a1b0001` (reservada; não usada)

---

## 3. Procedimento de teste

### Passo 1 — Login no app
- Faça login com um usuário **Paciente Monitorado**.
- A tela **Home** aparece com o card "Sistema de aquecimento" marcado como
  **DESCONECTADO** (ponto cinza).

### Passo 2 — Abrir a tela de conexão
- Toque em **Conectar** (ou **Gerenciar**) no card de equipamento, ou acesse via
  menu lateral → "Conectar equipamento".
- Verifique que o status inicial é **"Desconectado"** com dot cinza.

### Passo 3 — Buscar dispositivos
- Toque em **Buscar dispositivos**.
- O status muda para **"Buscando TERESA01…"** (dot amarelo).
- Após alguns segundos, o card **Dispositivos encontrados** deve listar:
  ```
  TERESA01
  <UUID do rádio> · -50 a -70 dBm
  [ Conectar ]
  ```
- Se o scan expirar sem encontrar o dispositivo:
  - Verifique se o ESP32 está energizado.
  - Verifique se o Bluetooth do celular está realmente ligado.
  - Confirme no monitor serial que o ESP32 está anunciando `TERESA01`.
  - Veja o card **Diagnóstico BLE** para a entrada de erro específica.

### Passo 4 — Conectar
- Toque em **Conectar** ao lado do TERESA01.
- O status muda para **"Conectando ao equipamento…"** com um sub-texto
  "Aguardando primeiro frame de telemetria…".
- Dentro de ~1-2 s, o status deve virar **"Conectado · recebendo telemetria"**
  (dot verde).

### Passo 5 — Validar leitura ao vivo
No próprio card **Leitura ao vivo** da tela "Conectar equipamento":
- **Temperatura** deve refletir o valor do AHT10 (ou MLX, conforme firmware).
- **Umidade** deve refletir o valor do AHT10.
- **Estado** deve ser um dos:
  `AGUARDANDO_BRACELETE`, `AGUARDANDO_INICIO`, `AQUECENDO`,
  `EM_TRATAMENTO`, `TRATAMENTO_INTERROMPIDO`, `TRATAMENTO_FINALIZADO`.

No card **Diagnóstico BLE**, você verá uma sequência de entradas `RX` com o
pacote cru, por exemplo:
```
RX   TEMP=36.8;HUM=52.4;STATE=AGUARDANDO_INICIO   14:22:03
RX   TEMP=36.8;HUM=52.5;STATE=AGUARDANDO_INICIO   14:22:04
```

### Passo 6 — Validar na Home
- Volte para a aba **Início**.
- O card "Sistema de aquecimento" deve estar **CONECTADO** (dot verde) e exibir:
  ```
  Última leitura há 2s · 14 frames
  ```
- Os cards de **Temperatura** e **Umidade** devem exibir os valores reais do
  sensor (não mais `—`).
- O **StateBadge** abaixo mostra o estado atual (`Aguardando início`, etc.).
- A cada ~1 s, o contador "frames" sobe e "última leitura" volta a 0 s.

### Passo 7 — Validar sincronização com o backend
- A cada 30 s, o app envia um `POST /api/readings` com a leitura corrente para
  o backend. Isso aparece no histórico (gráfico) e para o médico associado.
- Puxe para atualizar (**pull-to-refresh**) e verifique que a leitura mais
  recente aparece também pelo endpoint `GET /api/readings/latest`.

### Passo 8 — Validar detecção de desconexão
- **Teste 1 (perda de link súbita):** desligue o ESP32-C3.
  - Em até 10 s, o status muda para **"Reconectando automaticamente…"** com
    o contador "Tentativa X/10".
  - O card de Home exibe `RECONECTANDO 1/10`.
- **Teste 2 (fora de alcance):** afaste o celular do ESP32 (> ~10 m).
  - Mesmo comportamento acima.

### Passo 9 — Validar reconexão automática
- Religue o ESP32 (ou aproxime o celular).
- Dentro de 1 ciclo de 3 s, o app deve voltar automaticamente para
  **"Conectado · recebendo telemetria"**.
- O contador de "frames" é retomado.

### Passo 10 — Validar limite de tentativas
- Deixe o ESP32 desligado por mais tempo. Após **10 tentativas** sem sucesso,
  o app para a reconexão automática e exibe:
  ```
  ERRO   Limite de reconexão atingido (10). Toque em "Conectar" novamente.
  ```
- Toque em **Buscar dispositivos** → **Conectar** para reiniciar o ciclo.

### Passo 11 — Validar desconexão manual
- No status "Conectado", toque em **Desconectar**.
- O status volta para **"Desconectado"** imediatamente.
- Os cards Home voltam a mostrar `—` nos sensores.
- Nenhuma tentativa automática de reconexão ocorre.

---

## 4. Critérios de aceite ✅

Para que a validação seja considerada aprovada, **todos** os critérios abaixo
devem ser atendidos:

- [ ] O app encontra o TERESA01 no scan em até 12 s.
- [ ] A conexão BLE é estabelecida sem erros.
- [ ] O card "Diagnóstico BLE" exibe pacotes `RX` crus a cada ~1 s.
- [ ] Temperatura e umidade exibidos no app batem com valores plausíveis
      do AHT10/MLX (ou com o monitor serial do ESP32).
- [ ] O estado (`STATE=`) muda corretamente conforme o firmware avança no
      fluxo (ex.: `AGUARDANDO_INICIO` → `AQUECENDO` → `EM_TRATAMENTO`).
- [ ] Ao desligar o ESP32, o app detecta a desconexão em até 10 s e inicia
      reconexão automática.
- [ ] Ao religar o ESP32 (dentro das 10 tentativas), o app se reconecta
      sozinho sem necessidade de ação manual.
- [ ] **O app NUNCA exibe dados simulados enquanto o TERESA01 está conectado**.
      Todos os valores exibidos vêm diretamente da telemetria BLE.
- [ ] Ao desconectar manualmente, o app para completamente a tentativa de
      reconexão.

---

## 5. Troubleshooting rápido

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| Status fica em "BLUETOOTH DESLIGADO" | Rádio BT off no celular | Toque "Abrir configurações" e ligue o BT |
| Status fica em "PERMISSÃO NEGADA" | Usuário negou prompt | Toque "Abrir configurações do app" → autorize Bluetooth / Dispositivos próximos |
| Scan expira sem encontrar o TERESA01 | ESP32 fora da área, sem energia ou pareado em outro device | Energize, aproxime, feche outros apps BLE |
| Conecta mas fica "Conectando…" para sempre | Firmware não está enviando NOTIFY corretamente | Verifique monitor serial do ESP32 |
| Frame inválido no diagnóstico | Firmware enviou payload fora do padrão | O app descarta e aguarda próximo frame — veja log serial |
| Reconexão não para após desconexão manual | **Não deve acontecer**; se ocorrer, reportar bug | — |

---

## 6. Como gerar o build nativo pelo Emergent

1. No chat do Emergent, clique em **Publish** (canto superior direito).
2. Autorize a cobrança ECU para o primeiro deploy, se solicitado.
3. Aguarde o build terminar (recebe URL + QR code).
4. **Android:** baixe o `.apk` gerado e instale no celular (permita "fontes
   desconhecidas" se necessário).
5. **iOS:** o build é entregue pelo TestFlight ou via instalação direta do
   `.ipa` com um perfil de desenvolvimento válido.
6. Abra o app no celular, faça login e siga este documento.
