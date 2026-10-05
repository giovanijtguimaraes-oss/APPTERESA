import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/src/components/PrimaryButton';
import { Toast } from '@/src/components/Toast';
import { useAuth } from '@/src/contexts/AuthContext';
import { type BackendDiagnostic, pingBackend } from '@/src/services/api';
import { colors, radii, shadows, spacing, typography } from '@/src/theme/tokens';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'success' } | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diag, setDiag] = useState<BackendDiagnostic | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

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

  async function handleSubmit() {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setToast({ msg: 'Preencha e-mail e senha', type: 'error' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setToast({ msg: 'E-mail inválido', type: 'error' });
      return;
    }
    setLoading(true);
    try {
      await login(cleanEmail, password);
      router.replace('/(app)/(tabs)/home');
    } catch (e: any) {
      setToast({ msg: e?.detail ?? 'Falha no login', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        bottomOffset={24}
      >
        <View style={styles.brandWrap}>
          <Pressable
            onLongPress={runDiagnostic}
            delayLongPress={1500}
            style={styles.logoIcon}
            testID="diag-trigger"
          >
            <Ionicons name="medical" size={32} color={colors.surface} />
          </Pressable>
          <Text style={styles.brand}>T.E.R.E.S.A.</Text>
          <Text style={styles.tag}>
            Tecnologia Especializada em Recuperação e Estímulo à Saúde Avançada
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Entrar</Text>
          <Text style={styles.subtitle}>Acesse sua conta para continuar</Text>

          <View style={styles.field}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              testID="login-email"
              value={email}
              onChangeText={setEmail}
              placeholder="voce@exemplo.com"
              placeholderTextColor={colors.textDisabled}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Senha</Text>
            <TextInput
              testID="login-password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textDisabled}
              secureTextEntry
              style={styles.input}
            />
          </View>

          <View style={{ height: spacing.md }} />

          <PrimaryButton
            testID="login-submit"
            label="Entrar"
            onPress={handleSubmit}
            loading={loading}
          />

          <Pressable
            onPress={() => router.push('/register')}
            style={styles.link}
            testID="login-go-register"
          >
            <Text style={styles.linkText}>
              Não tem conta? <Text style={styles.linkAccent}>Criar conta</Text>
            </Text>
          </Pressable>

          <Pressable
            onPress={runDiagnostic}
            style={styles.diagLink}
            testID="login-diag-link"
          >
            <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.diagLinkText}>Verificar conexão com servidor</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>

      {toast && (
        <Toast
          visible
          message={toast.msg}
          type={toast.type}
          onHide={() => setToast(null)}
        />
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
                  {!diag.reachable && !diag.is_dev_build && (
                    <View style={styles.diagHint}>
                      <Text style={styles.diagHintText}>
                        Este APK não consegue falar com o servidor de produção.
                        Verifique sua internet. Se o problema persistir, pode ser
                        um APK antigo apontando para um servidor antigo — baixe
                        o novo APK no painel do Emergent e reinstale.
                      </Text>
                    </View>
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
    </SafeAreaView>
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
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    padding: spacing.container,
    gap: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  brandWrap: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xl,
  },
  logoIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.floating,
  },
  brand: {
    ...typography.h2,
    color: colors.primaryDark,
    letterSpacing: 2,
    marginTop: spacing.sm,
  },
  tag: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
    ...shadows.soft,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  field: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...typography.bodyLarge,
    color: colors.textPrimary,
  },
  link: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  linkText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  linkAccent: {
    color: colors.primary,
    fontWeight: '600',
  },
  diagLink: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  diagLinkText: {
    ...typography.caption,
    color: colors.textSecondary,
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
  diagHint: {
    marginTop: spacing.md,
    padding: spacing.sm,
    backgroundColor: '#FEF3C7',
    borderRadius: radii.md,
  },
  diagHintText: {
    ...typography.caption,
    color: '#92400E',
    lineHeight: 18,
  },
});
