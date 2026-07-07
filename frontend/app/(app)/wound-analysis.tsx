import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/src/components/Card';
import { CircularProgress } from '@/src/components/CircularProgress';
import { TopBar } from '@/src/components/TopBar';
import { api, type WoundPhoto } from '@/src/services/api';
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
  const [photo, setPhoto] = useState<WoundPhoto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.get<WoundPhoto[]>('/wound-photos');
        const found = id ? list.find((p) => p.id === id) : list[0];
        setPhoto(found ?? null);
      } catch {
        setPhoto(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

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
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.imageWrap}>
          <Image
            source={{ uri: `data:image/jpeg;base64,${photo.image_base64}` }}
            style={styles.image}
          />
          <View style={styles.timestampBadge}>
            <Ionicons name="time-outline" size={12} color={colors.surface} />
            <Text style={styles.timestampText}>{new Date(photo.timestamp).toLocaleString('pt-BR')}</Text>
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

        <Card padded testID="analysis-disclaimer">
          <View style={styles.disclaimerRow}>
            <Ionicons name="information-circle" size={20} color={colors.primary} />
            <Text style={styles.disclaimerText}>
              Esta análise é apoio clínico gerado por IA. Consulte sempre um
              profissional de saúde para decisões de tratamento.
            </Text>
          </View>
        </Card>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
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
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  imageWrap: {
    borderRadius: radii.card,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  image: {
    width: '100%',
    height: 260,
    resizeMode: 'cover',
  },
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
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
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
  evolutionText: {
    ...typography.caption,
    fontWeight: '700',
  },
  remainingLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  remainingValue: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  remainingUnit: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  metricRowLast: {
    borderBottomWidth: 0,
  },
  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: {
    flex: 1,
    ...typography.body,
    color: colors.textSecondary,
  },
  metricValue: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  notes: {
    ...typography.bodyLarge,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  disclaimerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  disclaimerText: {
    flex: 1,
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
