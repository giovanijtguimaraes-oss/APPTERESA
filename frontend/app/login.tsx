import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
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
import { colors, radii, shadows, spacing, typography } from '@/src/theme/tokens';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'success' } | null>(null);

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
          <View style={styles.logoIcon}>
            <Ionicons name="medical" size={32} color={colors.surface} />
          </View>
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
    </SafeAreaView>
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
});
