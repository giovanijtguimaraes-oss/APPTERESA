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

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'patient' | 'doctor'>('patient');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'success' } | null>(null);

  async function handleSubmit() {
    if (!name || !email || password.length < 6) {
      setToast({ msg: 'Preencha todos os campos (senha ≥ 6 caracteres)', type: 'error' });
      return;
    }
    setLoading(true);
    try {
      await register({ name: name.trim(), email: email.trim(), password, role });
      router.replace('/(app)/(tabs)/home');
    } catch (e: any) {
      setToast({ msg: e?.detail ?? 'Falha ao criar conta', type: 'error' });
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
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          testID="register-back"
        >
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>

        <View style={styles.headerWrap}>
          <Text style={styles.title}>Criar conta</Text>
          <Text style={styles.subtitle}>
            Vamos configurar seu perfil no T.E.R.E.S.A.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.roleWrap} testID="register-role-toggle">
            <Pressable
              onPress={() => setRole('patient')}
              style={[styles.roleBtn, role === 'patient' && styles.roleActive]}
              testID="register-role-patient"
            >
              <Ionicons
                name="person-outline"
                size={18}
                color={role === 'patient' ? colors.surface : colors.textSecondary}
              />
              <Text
                style={[styles.roleText, role === 'patient' && styles.roleTextActive]}
              >
                Paciente
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setRole('doctor')}
              style={[styles.roleBtn, role === 'doctor' && styles.roleActive]}
              testID="register-role-doctor"
            >
              <Ionicons
                name="medkit-outline"
                size={18}
                color={role === 'doctor' ? colors.surface : colors.textSecondary}
              />
              <Text
                style={[styles.roleText, role === 'doctor' && styles.roleTextActive]}
              >
                Médico(a)
              </Text>
            </Pressable>
          </View>

          <Field label="Nome completo">
            <TextInput
              testID="register-name"
              value={name}
              onChangeText={setName}
              placeholder="Seu nome"
              placeholderTextColor={colors.textDisabled}
              style={styles.input}
            />
          </Field>

          <Field label="E-mail">
            <TextInput
              testID="register-email"
              value={email}
              onChangeText={setEmail}
              placeholder="voce@exemplo.com"
              placeholderTextColor={colors.textDisabled}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
            />
          </Field>

          <Field label="Senha (mínimo 6 caracteres)">
            <TextInput
              testID="register-password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textDisabled}
              secureTextEntry
              style={styles.input}
            />
          </Field>

          <View style={{ height: spacing.sm }} />

          <PrimaryButton
            testID="register-submit"
            label="Criar conta"
            onPress={handleSubmit}
            loading={loading}
          />

          <Pressable
            onPress={() => router.back()}
            style={styles.link}
            testID="register-go-login"
          >
            <Text style={styles.linkText}>
              Já tem conta? <Text style={styles.linkAccent}>Entrar</Text>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    padding: spacing.container,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.sm,
  },
  headerWrap: {
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
    ...shadows.soft,
  },
  roleWrap: {
    flexDirection: 'row',
    backgroundColor: colors.primarySoft,
    padding: 4,
    borderRadius: radii.pill,
    marginBottom: spacing.md,
    gap: 4,
  },
  roleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  roleActive: {
    backgroundColor: colors.primary,
  },
  roleText: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  roleTextActive: {
    color: colors.surface,
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
