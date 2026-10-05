import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

import { Card } from '@/src/components/Card';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { Toast } from '@/src/components/Toast';
import { TopBar } from '@/src/components/TopBar';
import { api } from '@/src/services/api';
import { colors, radii, spacing, typography } from '@/src/theme/tokens';

type Level = 'info' | 'warning' | 'critical' | 'success';

const LEVELS: { value: Level; label: string; color: string }[] = [
  { value: 'info', label: 'Informativo', color: colors.primary },
  { value: 'success', label: 'Positivo', color: colors.greenGood },
  { value: 'warning', label: 'Atenção', color: colors.yellowObserve },
  { value: 'critical', label: 'Crítico', color: colors.redAlert },
];

export default function SendAlertScreen() {
  const { patientId } = useLocalSearchParams<{ patientId?: string }>();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState<Level>('info');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  async function submit() {
    if (!patientId) {
      setToast({ msg: 'Paciente não identificado', type: 'error' });
      return;
    }
    if (!title.trim() || !description.trim()) {
      setToast({ msg: 'Preencha título e descrição', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      await api.post(`/doctor/patient/${patientId}/alert`, {
        title: title.trim(),
        description: description.trim(),
        level,
      });
      setToast({ msg: 'Aviso enviado!', type: 'success' });
      setTimeout(() => router.back(), 900);
    } catch (e: any) {
      setToast({ msg: e?.detail ?? 'Falha ao enviar', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Enviar aviso" showBack />
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} bottomOffset={24}>
        <Card padded testID="send-alert-form">
          <Text style={styles.label}>Nível</Text>
          <View style={styles.levelRow}>
            {LEVELS.map((l) => {
              const active = l.value === level;
              return (
                <Pressable
                  key={l.value}
                  onPress={() => setLevel(l.value)}
                  style={[
                    styles.levelBtn,
                    { borderColor: active ? l.color : colors.borderLight },
                    active && { backgroundColor: l.color + '18' },
                  ]}
                  testID={`send-alert-level-${l.value}`}
                >
                  <View style={[styles.levelDot, { backgroundColor: l.color }]} />
                  <Text style={[styles.levelText, active && { color: l.color }]}>
                    {l.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Título</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Ex: Nova orientação"
            placeholderTextColor={colors.textDisabled}
            style={styles.input}
            testID="send-alert-title"
          />

          <Text style={styles.label}>Descrição</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Explique brevemente a mensagem…"
            placeholderTextColor={colors.textDisabled}
            style={[styles.input, styles.textarea]}
            multiline
            testID="send-alert-description"
          />

          <View style={{ height: spacing.md }} />

          <PrimaryButton
            label="Enviar ao paciente"
            onPress={submit}
            loading={saving}
            testID="btn-send-alert-submit"
          />
        </Card>

        <Card padded testID="send-alert-info">
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
            <Text style={styles.infoText}>
              O paciente receberá este aviso na aba Avisos. Ele será marcado
              como originado por você.
            </Text>
          </View>
        </Card>
      </KeyboardAwareScrollView>

      {toast && (
        <Toast visible message={toast.msg} type={toast.type} onHide={() => setToast(null)} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    padding: spacing.container,
    gap: spacing.md,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...typography.bodyLarge,
    color: colors.textPrimary,
  },
  textarea: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  levelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  levelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1.5,
  },
  levelDot: { width: 10, height: 10, borderRadius: 5 },
  levelText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  infoRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  infoText: { flex: 1, ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
});
