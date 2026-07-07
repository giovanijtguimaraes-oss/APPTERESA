import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';

import { Card } from '@/src/components/Card';
import { TopBar } from '@/src/components/TopBar';
import { useAuth } from '@/src/contexts/AuthContext';
import { colors, radii, spacing, typography } from '@/src/theme/tokens';

export default function SettingsScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const [notif, setNotif] = useState(true);
  const [sync, setSync] = useState(true);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Configurações" showBack />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card padded title="Preferências" testID="settings-prefs">
          <Row label="Tema" value="Claro (padrão)" icon="color-palette-outline" />
          <Row label="Idioma" value="Português (Brasil)" icon="language-outline" />
          <Row label="Notificações" icon="notifications-outline">
            <Switch value={notif} onValueChange={setNotif} testID="switch-notif" />
          </Row>
          <Row label="Sincronização automática" icon="cloud-outline" last>
            <Switch value={sync} onValueChange={setSync} testID="switch-sync" />
          </Row>
        </Card>

        <Card padded title="Dispositivo" testID="settings-device">
          <NavRow
            icon="bluetooth"
            label="Bluetooth"
            hint="Gerenciar conexão com T.E.R.E.S.A."
            onPress={() => router.push('/(app)/connect')}
          />
          <NavRow
            icon="shield-checkmark-outline"
            label="Permissões"
            hint="Câmera, Bluetooth, notificações"
            onPress={() => {}}
            last
          />
        </Card>

        <Card padded title="Dados" testID="settings-data">
          <NavRow
            icon="download-outline"
            label="Exportar relatório"
            hint="Baixar histórico completo em PDF"
            onPress={() => {}}
          />
          <NavRow
            icon="save-outline"
            label="Backup"
            hint="Cópia de segurança na nuvem"
            onPress={() => {}}
            last
          />
        </Card>

        <Card padded title="Sobre" testID="settings-about">
          <NavRow
            icon="information-circle-outline"
            label="Sobre o projeto"
            onPress={() => router.push('/(app)/about')}
          />
          <NavRow
            icon="help-circle-outline"
            label="Ajuda"
            onPress={() => router.push('/(app)/help')}
          />
          <NavRow
            icon="shield-outline"
            label="Política de privacidade"
            onPress={() => router.push('/(app)/privacy')}
          />
          <NavRow
            icon="refresh-outline"
            label="Verificar atualizações"
            onPress={() => {}}
            last
          />
        </Card>

        <Card padded testID="settings-version">
          <View style={styles.versionRow}>
            <Text style={styles.versionLabel}>Versão do aplicativo</Text>
            <Text style={styles.versionValue}>
              {Constants.expoConfig?.version ?? '1.0.0'}
            </Text>
          </View>
        </Card>

        <Pressable
          style={styles.logoutBtn}
          onPress={async () => {
            await logout();
            router.replace('/login');
          }}
          testID="settings-logout"
        >
          <Ionicons name="log-out-outline" size={20} color={colors.redAlert} />
          <Text style={styles.logoutText}>Sair da conta</Text>
        </Pressable>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  icon,
  children,
  last,
}: {
  label: string;
  value?: string;
  icon: keyof typeof Ionicons.glyphMap;
  children?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function NavRow({
  label,
  icon,
  hint,
  onPress,
  last,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  hint?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.row, last && styles.rowLast]}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    padding: spacing.container,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  rowValue: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  rowHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  versionLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  versionValue: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  logoutBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    backgroundColor: '#FEF2F2',
  },
  logoutText: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.redAlert,
  },
});
