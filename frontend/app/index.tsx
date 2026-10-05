import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PrimaryButton } from '@/src/components/PrimaryButton';
import { useAuth } from '@/src/contexts/AuthContext';
import { type BackendDiagnostic, pingBackend } from '@/src/services/api';
import { colors, radii, shadows, spacing, typography } from '@/src/theme/tokens';

/**
 * The app no longer has a dedicated /login screen. This index is now the
 * splash + silent auto-login as Dra. Ana. If auto-login fails (bad network,
 * backend down), we show a friendly retry card with the built-in diagnostic
 * so the user can tell the difference between "server offline" and "stale
 * APK pointing to the wrong URL".
 */
export default function Index() {
  const { user, loading, autoLoginInFlight, autoLoginError, retryAutoLogin } = useAuth();
  const router = useRouter();

  const [diagOpen, setDiagOpen] = useState(false);
  const [diag, setDiag] = useState<BackendDiagnostic | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  // Once we have a user, hop into the authenticated stack.
  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace('/(app)/(tabs)/home');
    }
  }, [user, loading, router]);

  async function handleRetry() {
    await retryAutoLogin();
  }

  async function runDiagnostic() {
    setDiagOpen(true);
    setDiagLoading(true);
    setDiag(null);
    try {
      const result = await pingBackend();
      setDiag(result);
    } finally {
      setDiagLoading(false);
    }
  }

  // --- UI states --------------------------------------------------------
  const stillBooting = loading || autoLoginInFlight;
  const authFailed = !stillBooting && !user && !!autoLoginError;

  return (
    <View style={styles.container}>
      <Pressable
        onLongPress={runDiagnostic}
        delayLongPress={1500}
        style={styles.logoIcon}
        testID="splash-diag-trigger"
      >
        <Ionicons name="medical" size={36} color={colors.surface} />
      </Pressable>
      <Text style={styles.brand}>T.E.R.E.S.A.</Text>
      <Text style={styles.tag}>
        Tecnologia Especializada em Recuperação e Estímulo à Saúde Avançada
      </Text>

      {stillBooting && (
        <View style={styles.statusWrap}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.statusText}>Preparando sua sessão…</Text>
        </View>
      )}

      {authFailed && (
        <View style={styles.errorCard} testID="splash-error-card">
          <View style={styles.errorHeader}>
            <Ionicons name="cloud-offline-outline" size={20} color={colors.redAlert} />
            <Text style={styles.errorTitle}>Não foi possível conectar</Text>
          </View>
          <Text style={styles.errorMsg} numberOfLines={3}>
            {autoLoginError}
          </Text>
          <View style={styles.errorActions}>
            <PrimaryButton
              label="Tentar novamente"
              onPress={handleRetry}
              loading={autoLoginInFlight}
              fullWidth={false}
              testID="splash-retry"
            />
            <PrimaryButton
              label="Diagnóstico"
              variant="outline"
              onPress={runDiagnostic}
              fullWidth={false}
              testID="splash-diag-link"
            />
          </View>
          <Text style={styles.errorHint}>
            Se o problema persistir, baixe o APK mais recente no painel do
            Emergent — pode ser que seu APK esteja apontando para um servidor
            antigo.
          </Text>
        </View>
      )}

      <Modal
        visible={diagOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDiagOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="pulse" size={22} color={colors.primary} />
              <Text style={styles.modalTitle}>Diagnóstico de conexão</Text>
            </View>
            <ScrollView style={styles.modalBody}>
              {diagLoading && (
                <Text style={styles.diagRow}>Testando conexão com o servidor…</Text>
              )}
              {diag && (
                <>
                  <DiagLine label="Backend em uso" value={diag.base_url} mono />
                  <DiagLine
                    label="Tipo de build"
                    value={diag.is_dev_build ? 'DEV (preview/Expo Go)' : 'PRODUÇÃO (APK/IPA)'}
                  />
                  <DiagLine
                    label="Servidor respondeu"
                    value={diag.reachable ? '✅ SIM' : '❌ NÃO'}
                    color={diag.reachable ? colors.greenGood : colors.redAlert}
                  />
                  {diag.http_status != null && (
                    <DiagLine label="Status HTTP" value={String(diag.http_status)} />
                  )}
                  {diag.latency_ms != null && (
                    <DiagLine label="Latência" value={`${diag.latency_ms} ms`} />
                  )}
                  {diag.error && (
                    <DiagLine
                      label="Erro"
                      value={diag.error}
                      color={colors.redAlert}
                    />
                  )}
                </>
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <PrimaryButton
                label="Testar novamente"
                variant="outline"
                onPress={runDiagnostic}
                loading={diagLoading}
                fullWidth={false}
              />
              <PrimaryButton
                label="Fechar"
                onPress={() => setDiagOpen(false)}
                fullWidth={false}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DiagLine({
  label,
  value,
  mono,
  color,
}: {
  label: string;
  value: string;
  mono?: boolean;
  color?: string;
}) {
  return (
    <View style={styles.diagLineRow}>
      <Text style={styles.diagLineLabel}>{label}</Text>
      <Text
        style={[
          styles.diagLineValue,
          mono && styles.diagMono,
          color ? { color } : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  logoIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    ...shadows.floating,
  },
  brand: {
    ...typography.h2,
    color: colors.primaryDark,
    letterSpacing: 2,
  },
  tag: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: spacing.lg,
  },
  statusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statusText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  errorCard: {
    width: '100%',
    maxWidth: 420,
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.soft,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorTitle: {
    ...typography.h4,
    color: colors.textPrimary,
  },
  errorMsg: {
    ...typography.body,
    color: colors.textSecondary,
  },
  errorActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  errorHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,25,48,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.floating,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    ...typography.h4,
    color: colors.textPrimary,
  },
  modalBody: {
    maxHeight: 320,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  diagRow: {
    ...typography.body,
    color: colors.textSecondary,
    paddingVertical: 6,
  },
  diagLineRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  diagLineLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 2,
  },
  diagLineValue: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  diagMono: {
    fontFamily: 'Menlo',
    fontSize: 13,
  },
});
