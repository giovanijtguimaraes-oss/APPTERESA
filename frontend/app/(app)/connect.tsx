import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/src/components/Card';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { Toast } from '@/src/components/Toast';
import { TopBar } from '@/src/components/TopBar';
import {
  bleService,
  type BleDevice,
  type ConnectionMeta,
  type ConnectionState,
  type DiagnosticEntry,
  type TeresaTelemetry,
} from '@/src/services/ble';
import { colors, radii, spacing, typography } from '@/src/theme/tokens';

const STEPS = [
  'Ative o Bluetooth no seu iPhone/Android.',
  'Ligue o equipamento T.E.R.E.S.A. (nome BLE "TERESA01").',
  'Aguarde o LED de pareamento acender.',
  'Abra o aplicativo T.E.R.E.S.A. e autorize o Bluetooth.',
  'Toque em "Buscar dispositivos" abaixo.',
  'Selecione TERESA01 na lista de dispositivos encontrados.',
  'Aguarde o primeiro frame de telemetria chegar (status fica VERDE).',
  'Pronto: temperatura, umidade e estado passam a atualizar em tempo real.',
];

export default function ConnectScreen() {
  const [state, setState] = useState<ConnectionState>(bleService.getState());
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [meta, setMeta] = useState<ConnectionMeta>(bleService.getMeta());
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>(
    bleService.getDiagnostics(),
  );
  const [tele, setTele] = useState<TeresaTelemetry | null>(bleService.getLastTelemetry());
  const [now, setNow] = useState<number>(Date.now());
  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'success' | 'info' } | null>(null);

  // Live "age" ticker — refreshes every second so the "última leitura há Xs"
  // readout always moves.
  const nowRef = useRef<number>(Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      nowRef.current = Date.now();
      setNow(nowRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const off1 = bleService.onStateChange(setState);
    const off2 = bleService.onDevicesChange(setDevices);
    const off3 = bleService.onMeta(setMeta);
    const off4 = bleService.onDiagnostics(setDiagnostics);
    const off5 = bleService.onTelemetry((t) => setTele(t));
    return () => {
      off1();
      off2();
      off3();
      off4();
      off5();
    };
  }, []);

  const isSupported = Platform.OS !== 'web' && bleService.isAvailable();

  async function scan() {
    if (!isSupported) {
      setToast({
        msg: 'BLE requer build nativo (iOS/Android). Gere um APK/IPA para testar.',
        type: 'info',
      });
      return;
    }
    await bleService.startScan();
  }

  async function connect(id: string) {
    await bleService.connect(id);
  }

  async function disconnect() {
    await bleService.disconnect();
  }

  async function cancelReconnect() {
    bleService.cancelReconnect();
  }

  function openSettings() {
    Linking.openSettings().catch(() => {
      setToast({ msg: 'Não foi possível abrir as configurações.', type: 'error' });
    });
  }

  const stateInfo = STATE_INFO[state];
  const lastFrameAgeMs = meta.lastFrameAt
    ? Math.max(0, now - new Date(meta.lastFrameAt).getTime())
    : null;
  const lastFrameAgeLabel = formatAge(lastFrameAgeMs);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Conectar equipamento" showBack />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Status card ------------------------------------------------------ */}
        <Card padded testID="connect-status-card">
          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <View style={[styles.statusDot, { backgroundColor: stateInfo.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.statusText}>{stateInfo.label}</Text>
                {state === 'reconnecting' && (
                  <Text style={styles.statusSub} testID="status-reconnect-sub">
                    Tentativa {meta.reconnectAttempt}/{meta.maxReconnectAttempts}
                  </Text>
                )}
                {state === 'connected' && lastFrameAgeLabel && (
                  <Text style={[styles.statusSub, { color: colors.greenGood }]} testID="status-last-rx">
                    Última leitura {lastFrameAgeLabel} · {meta.framesReceived} frames
                  </Text>
                )}
              </View>
            </View>
          </View>

          <View style={styles.statusActions}>
            {state === 'connected' && (
              <PrimaryButton
                label="Desconectar"
                variant="outline"
                onPress={disconnect}
                testID="btn-disconnect"
              />
            )}
            {state === 'reconnecting' && (
              <PrimaryButton
                label="Cancelar reconexão"
                variant="outline"
                onPress={cancelReconnect}
                testID="btn-cancel-reconnect"
              />
            )}
            {(state === 'disconnected' ||
              state === 'error' ||
              state === 'scanning') && (
              <PrimaryButton
                label={state === 'scanning' ? 'Buscando…' : 'Buscar dispositivos'}
                onPress={scan}
                loading={state === 'scanning'}
                testID="btn-scan"
              />
            )}
            {state === 'bt_off' && (
              <PrimaryButton
                label="Abrir configurações"
                onPress={openSettings}
                testID="btn-open-settings-bt"
              />
            )}
            {state === 'unauthorized' && (
              <PrimaryButton
                label="Abrir configurações do app"
                onPress={openSettings}
                testID="btn-open-settings-perm"
              />
            )}
            {state === 'connecting' && (
              <View style={styles.inlineInfo}>
                <Ionicons name="sync" size={16} color={colors.primary} />
                <Text style={styles.inlineInfoText}>
                  Aguardando primeiro frame de telemetria…
                </Text>
              </View>
            )}
          </View>

          {state === 'bt_off' && (
            <View style={styles.warnBoxDanger} testID="hint-bt-off">
              <Ionicons name="bluetooth" size={18} color={colors.redAlert} />
              <Text style={styles.warnTextDanger}>
                O Bluetooth está desligado. Ative-o nas Configurações do sistema para que o app
                consiga encontrar o TERESA01.
              </Text>
            </View>
          )}
          {state === 'unauthorized' && (
            <View style={styles.warnBoxDanger} testID="hint-permissions">
              <Ionicons name="lock-closed" size={18} color={colors.redAlert} />
              <Text style={styles.warnTextDanger}>
                O app não tem permissão de Bluetooth. Abra as configurações do app e autorize
                {'\u00A0'}Bluetooth (iOS) ou Dispositivos próximos (Android).
              </Text>
            </View>
          )}
          {!isSupported && (
            <View style={styles.warnBox} testID="ble-not-supported">
              <Ionicons name="information-circle" size={18} color={colors.primaryDark} />
              <Text style={styles.warnText}>
                BLE funciona apenas em builds nativos (iOS/Android). Em Expo Go/web esta tela
                permanece visual; gere um APK/IPA para o teste físico com o ESP32-C3.
              </Text>
            </View>
          )}
        </Card>

        {/* Devices --------------------------------------------------------- */}
        <Card padded title="Dispositivos encontrados" testID="devices-card">
          {devices.length === 0 ? (
            <View style={styles.emptyDevices}>
              <Ionicons name="bluetooth-outline" size={26} color={colors.textDisabled} />
              <Text style={styles.emptyText}>
                {state === 'scanning' ? 'Procurando TERESA01…' : 'Nenhum dispositivo'}
              </Text>
              <Text style={styles.emptyHint}>
                Certifique-se de que o equipamento T.E.R.E.S.A. (nome BLE TERESA01) está ligado
                e em modo de pareamento.
              </Text>
            </View>
          ) : (
            devices.map((d) => (
              <View key={d.id} style={styles.deviceRow} testID={`device-${d.id}`}>
                <View style={styles.deviceIcon}>
                  <Ionicons name="bluetooth" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deviceName}>{d.name ?? 'Dispositivo desconhecido'}</Text>
                  <Text style={styles.deviceId}>
                    {d.id}
                    {d.rssi != null ? ` · ${d.rssi} dBm` : ''}
                  </Text>
                </View>
                <PrimaryButton
                  label="Conectar"
                  fullWidth={false}
                  variant="secondary"
                  onPress={() => connect(d.id)}
                  testID={`btn-connect-${d.id}`}
                />
              </View>
            ))
          )}
        </Card>

        {/* Live telemetry — real raw values from the ESP32 ------------------ */}
        {state === 'connected' && tele && (
          <Card padded title="Leitura ao vivo" testID="live-tele-card">
            <View style={styles.liveRow}>
              <LiveCell
                label="Temperatura"
                value={`${tele.temperature_c.toFixed(1)} °C`}
                color={colors.redAlert}
                bg="#FEE2E2"
                icon="thermometer-outline"
              />
              <LiveCell
                label="Umidade"
                value={`${tele.humidity_pct.toFixed(0)} %`}
                color={colors.primary}
                bg={colors.primarySoft}
                icon="water-outline"
              />
            </View>
            <View style={styles.liveStateRow}>
              <Ionicons name="pulse-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.liveStateLabel}>Estado:</Text>
              <Text style={styles.liveStateValue}>{tele.state}</Text>
            </View>
          </Card>
        )}

        {/* Diagnostic log — invaluable during the physical bench test ------ */}
        <Card
          padded
          title="Diagnóstico BLE"
          testID="diag-card"
          action={
            <Pressable
              onPress={() => bleService.clearDiagnostics()}
              hitSlop={10}
              testID="btn-clear-diag"
            >
              <Text style={styles.clearLink}>Limpar</Text>
            </Pressable>
          }
        >
          {diagnostics.length === 0 ? (
            <Text style={styles.emptyHint}>
              Os eventos BLE (scan, conexão, frames recebidos, erros) aparecerão aqui.
              Mantenha esta tela aberta durante o teste físico para auditar o fluxo.
            </Text>
          ) : (
            <View style={styles.diagList}>
              {diagnostics
                .slice()
                .reverse()
                .map((d, i) => (
                  <View key={`${d.at}-${i}`} style={styles.diagRow}>
                    <Text style={[styles.diagTag, tagColor(d.level)]}>{tagLabel(d.level)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.diagText} numberOfLines={3}>
                        {d.text}
                      </Text>
                      <Text style={styles.diagTime}>{formatClock(d.at)}</Text>
                    </View>
                  </View>
                ))}
            </View>
          )}
        </Card>

        {/* Steps ----------------------------------------------------------- */}
        <Card padded title="Passo a passo" testID="steps-card">
          {STEPS.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </Card>

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {toast && (
        <Toast visible message={toast.msg} type={toast.type} onHide={() => setToast(null)} />
      )}
    </SafeAreaView>
  );
}

// ============================================================================
// Small helpers
// ============================================================================
function LiveCell({
  label,
  value,
  color,
  bg,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  bg: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.liveCell}>
      <View style={[styles.liveIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View>
        <Text style={styles.liveLabel}>{label}</Text>
        <Text style={styles.liveValue}>{value}</Text>
      </View>
    </View>
  );
}

function formatAge(ms: number | null): string | null {
  if (ms == null) return null;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  return `há ${h}h`;
}

function formatClock(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}

function tagLabel(level: DiagnosticEntry['level']) {
  switch (level) {
    case 'rx':
      return 'RX';
    case 'warn':
      return 'AVISO';
    case 'error':
      return 'ERRO';
    default:
      return 'INFO';
  }
}

function tagColor(level: DiagnosticEntry['level']) {
  switch (level) {
    case 'rx':
      return { backgroundColor: '#D1FAE5', color: colors.greenGood };
    case 'warn':
      return { backgroundColor: '#FEF3C7', color: colors.yellowObserve };
    case 'error':
      return { backgroundColor: '#FEE2E2', color: colors.redAlert };
    default:
      return { backgroundColor: colors.primarySoft, color: colors.primary };
  }
}

// ============================================================================
// State → visual metadata
// ============================================================================
const STATE_INFO: Record<ConnectionState, { label: string; color: string }> = {
  disconnected: { label: 'Desconectado', color: colors.textDisabled },
  scanning: { label: 'Buscando TERESA01…', color: colors.yellowObserve },
  connecting: { label: 'Conectando ao equipamento…', color: colors.yellowObserve },
  connected: { label: 'Conectado · recebendo telemetria', color: colors.greenGood },
  reconnecting: { label: 'Reconectando automaticamente…', color: colors.yellowObserve },
  bt_off: { label: 'Bluetooth desligado', color: colors.redAlert },
  unauthorized: { label: 'Permissão Bluetooth negada', color: colors.redAlert },
  error: { label: 'Erro na conexão', color: colors.redAlert },
};

// ============================================================================
// Styles
// ============================================================================
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.container, gap: spacing.md },

  // Status
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  statusLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  statusText: { ...typography.h4, color: colors.textPrimary },
  statusSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2, fontWeight: '600' },
  statusActions: { marginTop: spacing.md, gap: spacing.sm },

  inlineInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
  },
  inlineInfoText: { ...typography.caption, color: colors.primaryDark, fontWeight: '600' },

  warnBox: {
    marginTop: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  warnText: { flex: 1, ...typography.caption, color: colors.primaryDark },

  warnBoxDanger: {
    marginTop: spacing.md,
    padding: spacing.sm,
    backgroundColor: '#FEE2E2',
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  warnTextDanger: { flex: 1, ...typography.caption, color: colors.redAlert, fontWeight: '600' },

  // Devices
  emptyDevices: { alignItems: 'center', paddingVertical: spacing.lg, gap: 6 },
  emptyText: { ...typography.body, color: colors.textSecondary, fontWeight: '600' },
  emptyHint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
    alignSelf: 'center',
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  deviceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceName: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  deviceId: { ...typography.caption, color: colors.textSecondary },

  // Live telemetry
  liveRow: { flexDirection: 'row', gap: spacing.md },
  liveCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radii.md,
  },
  liveIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  liveValue: { ...typography.h4, color: colors.textPrimary, marginTop: 2 },
  liveStateRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveStateLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  liveStateValue: { ...typography.caption, color: colors.textPrimary, fontWeight: '700', letterSpacing: 0.5 },

  // Diagnostics
  clearLink: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  diagList: { gap: 6 },
  diagRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  diagTag: {
    minWidth: 46,
    textAlign: 'center',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    overflow: 'hidden',
    ...typography.caption,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.6,
  },
  diagText: { ...typography.caption, color: colors.textPrimary, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
  diagTime: { ...typography.caption, color: colors.textDisabled, marginTop: 1, fontSize: 10 },

  // Steps
  stepRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, alignItems: 'flex-start' },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { color: colors.surface, fontWeight: '700', fontSize: 13 },
  stepText: { flex: 1, ...typography.body, color: colors.textPrimary, lineHeight: 22 },
});
