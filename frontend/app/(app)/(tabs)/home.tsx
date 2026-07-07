import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/src/components/Card';
import { CircularProgress } from '@/src/components/CircularProgress';
import { EmptyState } from '@/src/components/EmptyState';
import { LineChart } from '@/src/components/LineChart';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { SegmentedControl } from '@/src/components/SegmentedControl';
import { Toast } from '@/src/components/Toast';
import { TopBar } from '@/src/components/TopBar';
import { useAuth } from '@/src/contexts/AuthContext';
import {
  api,
  type AlertItem,
  type Contact,
  type Reading,
  type WoundPhoto,
} from '@/src/services/api';
import { colors, radii, shadows, spacing, typography } from '@/src/theme/tokens';

type RangeKey = '24h' | '7d' | '30d';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [range, setRange] = useState<RangeKey>('24h');
  const [readings, setReadings] = useState<Reading[]>([]);
  const [latest, setLatest] = useState<Reading | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [latestPhoto, setLatestPhoto] = useState<WoundPhoto | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'success' | 'info' } | null>(
    null,
  );

  const loadAll = useCallback(async () => {
    try {
      const [r, l, a, c, p] = await Promise.all([
        api.get<Reading[]>(`/readings?range=${range}`),
        api.get<Reading | null>('/readings/latest'),
        api.get<AlertItem[]>('/alerts'),
        api.get<Contact[]>('/contacts'),
        api.get<WoundPhoto | null>('/wound-photos/latest'),
      ]);
      setReadings(r);
      setLatest(l);
      setAlerts(a.slice(0, 4));
      setContacts(c.slice(0, 6));
      setLatestPhoto(p);
    } catch (e: any) {
      setToast({ msg: e?.detail ?? 'Falha ao carregar dados', type: 'error' });
    }
  }, [range]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadAll();
      setLoading(false);
    })();
  }, [loadAll]);

  async function onRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  async function pickAndAnalyze() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    let result: ImagePicker.ImagePickerResult;

    if (perm.granted) {
      result = await ImagePicker.launchCameraAsync({
        base64: true,
        allowsEditing: true,
        quality: 0.6,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
    } else {
      // Fallback to library if camera denied
      const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!libPerm.granted) {
        setToast({ msg: 'Permissão necessária para acessar câmera/galeria', type: 'error' });
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        base64: true,
        allowsEditing: true,
        quality: 0.6,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
    }

    if (result.canceled || !result.assets?.[0]?.base64) return;

    setAnalyzing(true);
    try {
      const b64 = result.assets[0].base64!;
      const photo = await api.post<WoundPhoto>('/wound-photos/analyze', {
        image_base64: b64,
      });
      setLatestPhoto(photo);
      setToast({ msg: 'Análise concluída!', type: 'success' });
      router.push(`/(app)/wound-analysis?id=${photo.id}`);
    } catch (e: any) {
      setToast({ msg: e?.detail ?? 'Falha na análise', type: 'error' });
    } finally {
      setAnalyzing(false);
    }
  }

  const chartData = readings.map((r, i) => ({ x: i, y: r.temperature_c }));
  const humidityData = readings.map((r, i) => ({ x: i, y: r.humidity_pct }));
  const healingPct = latestPhoto?.analysis?.healing_percentage ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerBlock}>
          <Text style={styles.hello}>Olá, {user?.name.split(' ')[0]} 👋</Text>
          <Text style={styles.subhello}>Acompanhe seu progresso em tempo real</Text>
        </View>

        {/* Environmental cards */}
        <View style={styles.envRow}>
          <MetricCard
            testID="metric-temperature"
            icon="thermometer-outline"
            iconColor={colors.redAlert}
            iconBg="#FEE2E2"
            label="Temperatura"
            value={latest ? latest.temperature_c.toFixed(1) : '—'}
            unit="°C"
          />
          <MetricCard
            testID="metric-humidity"
            icon="water-outline"
            iconColor={colors.primary}
            iconBg={colors.primarySoft}
            label="Umidade"
            value={latest ? latest.humidity_pct.toFixed(0) : '—'}
            unit="%"
          />
        </View>

        {/* Temperature chart */}
        <Card
          padded
          testID="card-temperature-chart"
          title="Evolução da temperatura"
          action={
            <SegmentedControl
              options={[
                { label: '24h', value: '24h' },
                { label: '7d', value: '7d' },
                { label: '30d', value: '30d' },
              ]}
              value={range}
              onChange={(v) => setRange(v)}
              testIDPrefix="range"
            />
          }
        >
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.lg }} />
          ) : (
            <LineChart data={chartData} yUnit="°" color={colors.primary} />
          )}
        </Card>

        {/* Humidity chart (smaller) */}
        {readings.length > 0 && (
          <Card padded title="Umidade" testID="card-humidity-chart">
            <LineChart data={humidityData} height={140} yUnit="%" color="#0EA5E9" />
          </Card>
        )}

        {/* Wound analysis */}
        <Card padded testID="card-wound-analysis" title="Análise da ferida">
          <View style={styles.analysisRow}>
            <Pressable
              onPress={pickAndAnalyze}
              disabled={analyzing}
              style={({ pressed }) => [
                styles.cameraBtn,
                pressed && styles.cameraBtnPressed,
                analyzing && styles.cameraBtnDisabled,
              ]}
              testID="btn-capture-wound"
            >
              {analyzing ? (
                <ActivityIndicator color={colors.surface} />
              ) : latestPhoto ? (
                <Image
                  source={{ uri: `data:image/jpeg;base64,${latestPhoto.image_base64}` }}
                  style={styles.cameraImage}
                />
              ) : (
                <Ionicons name="camera" size={34} color={colors.surface} />
              )}
            </Pressable>
            <View style={styles.analysisText}>
              <Text style={styles.analysisLabel}>
                {latestPhoto ? 'Toque para nova análise' : 'Tire uma foto para analisar'}
              </Text>
              <Text style={styles.analysisSub}>
                {analyzing
                  ? 'Analisando com IA…'
                  : 'IA médica analisa a lesão automaticamente'}
              </Text>
            </View>
            <CircularProgress
              percentage={healingPct}
              size={82}
              strokeWidth={9}
              label="Cicatrização"
              testID="wound-healing-progress"
            />
          </View>

          {latestPhoto?.analysis && (
            <Pressable
              style={styles.viewAnalysisBtn}
              onPress={() =>
                router.push(`/(app)/wound-analysis?id=${latestPhoto.id}`)
              }
              testID="btn-view-analysis"
            >
              <Text style={styles.viewAnalysisText}>Ver análise completa</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </Pressable>
          )}
        </Card>

        {/* Quick alerts */}
        <Card padded title="Alertas rápidos" testID="card-alerts">
          {alerts.length === 0 ? (
            <EmptyState
              icon="checkmark-circle-outline"
              title="Nenhum alerta agora"
              description="Você verá aqui alertas importantes do equipamento e do ambiente."
              testID="alerts-empty"
            />
          ) : (
            <View style={styles.alertsList}>
              {alerts.map((a) => (
                <AlertRow key={a.id} alert={a} />
              ))}
            </View>
          )}
        </Card>

        {/* Quick contacts */}
        <Card padded title="Contatos rápidos" testID="card-contacts">
          {contacts.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="Adicione seus contatos"
              description="Médicos, enfermeiros e familiares para ligar rapidamente."
              action={
                <PrimaryButton
                  label="Adicionar contatos"
                  onPress={() => router.push('/(app)/(tabs)/profile')}
                  testID="btn-add-contacts"
                  variant="secondary"
                />
              }
            />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.contactScroll}
            >
              {contacts.map((c) => (
                <ContactCard key={c.id} contact={c} />
              ))}
            </ScrollView>
          )}
        </Card>

        <View style={{ height: spacing.xl }} />
      </ScrollView>

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

function MetricCard({
  icon,
  iconColor,
  iconBg,
  label,
  value,
  unit,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  label: string;
  value: string;
  unit: string;
  testID: string;
}) {
  return (
    <View style={styles.metricCard} testID={testID}>
      <View style={[styles.metricIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValRow}>
        <Text style={styles.metricValue}>{value}</Text>
        <Text style={styles.metricUnit}>{unit}</Text>
      </View>
    </View>
  );
}

function AlertRow({ alert }: { alert: AlertItem }) {
  const map = {
    info: { icon: 'information-circle', color: colors.primary, bg: colors.primarySoft },
    warning: { icon: 'warning', color: colors.yellowObserve, bg: '#FEF3C7' },
    critical: { icon: 'alert-circle', color: colors.redAlert, bg: '#FEE2E2' },
    success: { icon: 'checkmark-circle', color: colors.greenGood, bg: '#D1FAE5' },
  }[alert.level];

  return (
    <View style={styles.alertRow} testID={`alert-row-${alert.id}`}>
      <View style={[styles.alertIcon, { backgroundColor: map.bg }]}>
        <Ionicons name={map.icon as any} size={18} color={map.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.alertTitle} numberOfLines={1}>
          {alert.title}
        </Text>
        <Text style={styles.alertDesc} numberOfLines={2}>
          {alert.description}
        </Text>
      </View>
    </View>
  );
}

function ContactCard({ contact }: { contact: Contact }) {
  return (
    <View style={styles.contactCard} testID={`contact-card-${contact.id}`}>
      <View style={styles.contactAvatarWrap}>
        {contact.photo_base64 ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${contact.photo_base64}` }}
            style={styles.contactAvatar}
          />
        ) : (
          <View style={[styles.contactAvatar, styles.contactAvatarPlaceholder]}>
            <Text style={styles.contactAvatarText}>
              {contact.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.contactName} numberOfLines={1}>
        {contact.name}
      </Text>
      <Text style={styles.contactRole} numberOfLines={1}>
        {contact.role}
      </Text>
      <View style={styles.callBtn}>
        <Ionicons name="call" size={14} color={colors.surface} />
        <Text style={styles.callText}>Ligar</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    padding: spacing.container,
    gap: spacing.md,
  },
  headerBlock: {
    marginBottom: spacing.xs,
  },
  hello: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  subhello: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  envRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    ...shadows.soft,
  },
  metricIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  metricLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  metricValRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  metricValue: {
    ...typography.metric,
    fontSize: 32,
    lineHeight: 38,
    color: colors.textPrimary,
  },
  metricUnit: {
    ...typography.h4,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  analysisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cameraBtn: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...shadows.floating,
  },
  cameraBtnPressed: {
    opacity: 0.85,
  },
  cameraBtnDisabled: {
    opacity: 0.7,
  },
  cameraImage: {
    width: 82,
    height: 82,
  },
  analysisText: {
    flex: 1,
  },
  analysisLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  analysisSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  viewAnalysisBtn: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
  },
  viewAnalysisText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
  alertsList: {
    gap: spacing.sm,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radii.md,
  },
  alertIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  alertDesc: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  contactScroll: {
    gap: spacing.md,
    paddingRight: spacing.md,
  },
  contactCard: {
    width: 130,
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  contactAvatarWrap: {
    marginBottom: spacing.xs,
  },
  contactAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  contactAvatarPlaceholder: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactAvatarText: {
    color: colors.surface,
    ...typography.h4,
  },
  contactName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
  },
  contactRole: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  callBtn: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
  },
  callText: {
    ...typography.caption,
    color: colors.surface,
    fontWeight: '700',
  },
});
