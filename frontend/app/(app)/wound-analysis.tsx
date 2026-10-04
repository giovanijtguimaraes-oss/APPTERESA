import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/src/components/Card';
import { CircularProgress } from '@/src/components/CircularProgress';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { Toast } from '@/src/components/Toast';
import { TopBar } from '@/src/components/TopBar';
import { useAuth } from '@/src/contexts/AuthContext';
import { api, type WoundFeedback, type WoundPhoto } from '@/src/services/api';
import { colors, radii, spacing, typography } from '@/src/theme/tokens';

const INFLAMMATION_LABEL = { low: 'Baixa', medium: 'Média', high: 'Alta' } as const;
const GRAN_LABEL = {
  poor: 'Ruim',
  fair: 'Regular',
  good: 'Bom',
  excellent: 'Excelente',
} as const;
const EVOLUTION_LABEL = {
  worsening: 'Piorando',
  stable: 'Estável',
  improving: 'Melhorando',
  well_healing: 'Cicatrizando bem',
} as const;

export default function WoundAnalysisScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const [photo, setPhoto] = useState<WoundPhoto | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const isDoctor = user?.role === 'doctor';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (id) {
        try {
          const p = await api.get<WoundPhoto>(`/wound-photos/${id}`);
          setPhoto(p);
          return;
        } catch {
          /* fallback below */
        }
      }
      const list = await api.get<WoundPhoto[]>('/wound-photos');
      const found = id ? list.find((p) => p.id === id) : list[0];
      setPhoto(found ?? null);
    } catch {
      setPhoto(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopBar title="Análise da ferida" showBack />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!photo || !photo.analysis) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopBar title="Análise da ferida" showBack />
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.textDisabled} />
          <Text style={styles.emptyText}>Análise não encontrada</Text>
        </View>
      </SafeAreaView>
    );
  }

  const a = photo.analysis;
  const evolutionColor =
    a.evolution === 'well_healing' || a.evolution === 'improving'
      ? colors.greenGood
      : a.evolution === 'stable'
        ? colors.yellowObserve
        : colors.redAlert;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Análise da ferida" showBack />
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} bottomOffset={24}>
        <View style={styles.imageWrap}>
          <Image
            source={{ uri: `data:image/jpeg;base64,${photo.image_base64}` }}
            style={styles.image}
          />
          <View style={styles.timestampBadge}>
            <Ionicons name="time-outline" size={12} color={colors.surface} />
            <Text style={styles.timestampText}>
              {new Date(photo.timestamp).toLocaleString('pt-BR')}
            </Text>
          </View>
        </View>

        <Card padded testID="analysis-summary-card">
          <View style={styles.summaryRow}>
            <CircularProgress
              percentage={a.healing_percentage}
              size={112}
              strokeWidth={12}
              label="Cicatrizado"
            />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={[styles.evolutionBadge, { backgroundColor: evolutionColor + '22' }]}>
                <Ionicons name="trending-up" size={14} color={evolutionColor} />
                <Text style={[styles.evolutionText, { color: evolutionColor }]}>
                  {EVOLUTION_LABEL[a.evolution]}
                </Text>
              </View>
              <Text style={styles.remainingLabel}>Tempo estimado</Text>
              <Text style={styles.remainingValue}>
                {a.estimated_days_remaining}{' '}
                <Text style={styles.remainingUnit}>dias</Text>
              </Text>
            </View>
          </View>
        </Card>

        <Card padded title="Métricas clínicas" testID="analysis-metrics-card">
          <MetricRow
            icon="resize-outline"
            label="Área estimada"
            value={`${a.estimated_area_cm2.toFixed(1)} cm²`}
          />
          <MetricRow
            icon="color-palette-outline"
            label="Cor predominante"
            value={a.predominant_color}
          />
          <MetricRow
            icon="flame-outline"
            label="Inflamação"
            value={INFLAMMATION_LABEL[a.inflammation_level]}
          />
          <MetricRow
            icon="leaf-outline"
            label="Granulação"
            value={GRAN_LABEL[a.granulation_quality]}
            last
          />
        </Card>

        <Card padded title="Observações da IA" testID="analysis-notes-card">
          <Text style={styles.notes}>{a.notes}</Text>
        </Card>

        {/* Doctor-only feedback form OR read-only feedback preview */}
        <FeedbackSection
          photoId={photo.id}
          currentFeedback={photo.feedback ?? null}
          isDoctor={isDoctor}
          onSaved={() => {
            load();
            setToast({ msg: 'Avaliação salva!', type: 'success' });
          }}
          onError={(msg) => setToast({ msg, type: 'error' })}
        />

        <Card padded testID="analysis-disclaimer">
          <View style={styles.disclaimerRow}>
            <Ionicons name="information-circle" size={20} color={colors.primary} />
            <Text style={styles.disclaimerText}>
              Esta análise é apoio clínico gerado por IA e NÃO constitui
              diagnóstico médico. Consulte sempre um profissional de saúde.
            </Text>
          </View>
        </Card>

        <View style={{ height: spacing.xl }} />
      </KeyboardAwareScrollView>

      {toast && (
        <Toast visible message={toast.msg} type={toast.type} onHide={() => setToast(null)} />
      )}
    </SafeAreaView>
  );
}

function FeedbackSection({
  photoId,
  currentFeedback,
  isDoctor,
  onSaved,
  onError,
}: {
  photoId: string;
  currentFeedback: WoundFeedback | null;
  isDoctor: boolean;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [rating, setRating] = useState<number>(currentFeedback?.rating ?? 0);
  const [comment, setComment] = useState<string>(currentFeedback?.comment ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (rating < 1) {
      onError('Escolha uma nota de 1 a 5 estrelas');
      return;
    }
    setSaving(true);
    try {
      await api.post<WoundFeedback>(`/wound-photos/${photoId}/feedback`, {
        rating,
        comment: comment.trim() || null,
      });
      onSaved();
    } catch (e: any) {
      onError(e?.detail ?? 'Falha ao salvar avaliação');
    } finally {
      setSaving(false);
    }
  }

  // Patient view: show saved feedback (if any), nothing to edit.
  if (!isDoctor) {
    if (!currentFeedback) return null;
    return (
      <Card padded title="Avaliação do médico" testID="feedback-readonly">
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Ionicons
              key={n}
              name={n <= currentFeedback.rating ? 'star' : 'star-outline'}
              size={22}
              color={n <= currentFeedback.rating ? '#F59E0B' : colors.textDisabled}
            />
          ))}
          <Text style={styles.feedbackMeta}>
            por {currentFeedback.doctor_name}
          </Text>
        </View>
        {currentFeedback.comment ? (
          <Text style={styles.feedbackText}>{currentFeedback.comment}</Text>
        ) : null}
      </Card>
    );
  }

  return (
    <Card padded title="Avaliação do médico" testID="feedback-form">
      <Text style={styles.feedbackLabel}>Qualidade da análise</Text>
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => setRating(n)}
            hitSlop={6}
            testID={`star-${n}`}
          >
            <Ionicons
              name={n <= rating ? 'star' : 'star-outline'}
              size={28}
              color={n <= rating ? '#F59E0B' : colors.textDisabled}
            />
          </Pressable>
        ))}
      </View>

      <Text style={styles.feedbackLabel}>Comentário</Text>
      <TextInput
        value={comment}
        onChangeText={setComment}
        placeholder="Observações clínicas, orientações…"
        placeholderTextColor={colors.textDisabled}
        multiline
        style={styles.feedbackInput}
        testID="feedback-comment"
      />

      <View style={{ height: spacing.md }} />

      <PrimaryButton
        label={currentFeedback ? 'Atualizar avaliação' : 'Salvar avaliação'}
        onPress={save}
        loading={saving}
        testID="btn-save-feedback"
      />
    </Card>
  );
}

function MetricRow({
  icon,
  label,
  value,
  last,
}: {
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.metricRow, last && styles.metricRowLast]}>
      <View style={styles.metricIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    padding: spacing.container,
    gap: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyText: { ...typography.body, color: colors.textSecondary },
  imageWrap: {
    borderRadius: radii.card,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  image: { width: '100%', height: 260, resizeMode: 'cover' },
  timestampBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(10, 25, 48, 0.7)',
  },
  timestampText: {
    ...typography.caption,
    color: colors.surface,
    fontWeight: '600',
    fontSize: 10,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  evolutionBadge: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    marginBottom: spacing.sm,
  },
  evolutionText: { ...typography.caption, fontWeight: '700' },
  remainingLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  remainingValue: { ...typography.h2, color: colors.textPrimary },
  remainingUnit: { ...typography.body, color: colors.textSecondary, fontWeight: '400' },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  metricRowLast: { borderBottomWidth: 0 },
  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: { flex: 1, ...typography.body, color: colors.textSecondary },
  metricValue: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  notes: { ...typography.bodyLarge, color: colors.textPrimary, lineHeight: 24 },
  disclaimerRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  disclaimerText: {
    flex: 1,
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  // Feedback
  feedbackLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: spacing.sm,
    marginBottom: 6,
  },
  starsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feedbackMeta: { marginLeft: spacing.sm, ...typography.caption, color: colors.textSecondary },
  feedbackText: {
    marginTop: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  feedbackInput: {
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...typography.body,
    color: colors.textPrimary,
    minHeight: 90,
    textAlignVertical: 'top',
  },
});
