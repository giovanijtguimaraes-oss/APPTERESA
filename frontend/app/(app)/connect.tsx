import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  Platform,
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
  type ConnectionState,
} from '@/src/services/ble';
import { colors, radii, spacing, typography } from '@/src/theme/tokens';

const STEPS = [
  'Ative o Bluetooth no seu iPhone.',
  'Ligue o equipamento T.E.R.E.S.A.',
  'Aguarde o LED de pareamento acender.',
  'Abra o aplicativo T.E.R.E.S.A.',
  'Toque em “Buscar dispositivos” abaixo.',
  'Selecione o equipamento na lista.',
  'Autorize a conexão Bluetooth quando solicitado.',
  'Aguarde a confirmação de pareamento.',
  'Equipamento pronto para uso!',
];

export default function ConnectScreen() {
  const [state, setState] = useState<ConnectionState>(bleService.getState());
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'success' | 'info' } | null>(null);

  useEffect(() => {
    const off1 = bleService.onStateChange(setState);
    const off2 = bleService.onDevicesChange(setDevices);
    return () => {
      off1();
      off2();
    };
  }, []);

  const isSupported = Platform.OS !== 'web' && bleService.isAvailable();

  async function scan() {
    if (!isSupported) {
      setToast({
        msg: 'BLE requer build nativo. Publique o app para gerar um build.',
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

  const stateInfo = STATE_INFO[state];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Conectar equipamento" showBack />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card padded testID="connect-status-card">
          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <View style={[styles.statusDot, { backgroundColor: stateInfo.color }]} />
              <Text style={styles.statusText}>{stateInfo.label}</Text>
            </View>
            {state === 'connected' ? (
              <PrimaryButton
                label="Desconectar"
                variant="outline"
                fullWidth={false}
                onPress={disconnect}
                testID="btn-disconnect"
              />
            ) : (
              <PrimaryButton
                label={state === 'scanning' ? 'Buscando…' : 'Buscar dispositivos'}
                onPress={scan}
                loading={state === 'scanning'}
                fullWidth={false}
                testID="btn-scan"
              />
            )}
          </View>

          {!isSupported && (
            <View style={styles.warnBox} testID="ble-not-supported">
              <Ionicons name="information-circle" size={18} color={colors.primaryDark} />
              <Text style={styles.warnText}>
                O Bluetooth só funciona em builds nativos (iOS/Android). No Expo
                Go/web, esta tela permanece funcional visualmente e a arquitetura
                está pronta para produção.
              </Text>
            </View>
          )}
        </Card>

        <Card padded title="Dispositivos encontrados" testID="devices-card">
          {devices.length === 0 ? (
            <View style={styles.emptyDevices}>
              <Ionicons name="bluetooth-outline" size={26} color={colors.textDisabled} />
              <Text style={styles.emptyText}>Nenhum dispositivo encontrado ainda</Text>
              <Text style={styles.emptyHint}>
                Certifique-se de que o equipamento está ligado e em modo de pareamento.
              </Text>
            </View>
          ) : (
            devices.map((d) => (
              <View key={d.id} style={styles.deviceRow} testID={`device-${d.id}`}>
                <View style={styles.deviceIcon}>
                  <Ionicons name="bluetooth" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deviceName}>
                    {d.name ?? 'Dispositivo desconhecido'}
                  </Text>
                  <Text style={styles.deviceId}>
                    {d.id} {d.rssi ? `· ${d.rssi} dBm` : ''}
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

const STATE_INFO: Record<ConnectionState, { label: string; color: string }> = {
  disconnected: { label: 'Desconectado', color: colors.textDisabled },
  scanning: { label: 'Buscando dispositivos…', color: colors.yellowObserve },
  connecting: { label: 'Conectando…', color: colors.yellowObserve },
  connected: { label: 'Conectado', color: colors.greenGood },
  error: { label: 'Erro na conexão', color: colors.redAlert },
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    padding: spacing.container,
    gap: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusText: {
    ...typography.h4,
    color: colors.textPrimary,
  },
  warnBox: {
    marginTop: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  warnText: {
    flex: 1,
    ...typography.caption,
    color: colors.primaryDark,
  },
  emptyDevices: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: 6,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  emptyHint: {
    ...typography.caption,
    color: colors.textDisabled,
    textAlign: 'center',
    maxWidth: 260,
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
  deviceName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  deviceId: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: colors.surface,
    fontWeight: '700',
    fontSize: 13,
  },
  stepText: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 22,
  },
});
