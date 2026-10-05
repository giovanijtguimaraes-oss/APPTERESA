import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { StateBadge } from '@/src/components/StateBadge';
import { Toast } from '@/src/components/Toast';
import { TopBar } from '@/src/components/TopBar';
import { useAuth } from '@/src/contexts/AuthContext';
import {
  api,
  type AlertItem,
  type Contact,
  type Reading,
  type User,
  type WoundPhoto,
} from '@/src/services/api';
import {
  bleService,
  type ConnectionMeta,
  type ConnectionState,
  type TeresaTelemetry,
  type TreatmentState,
} from '@/src/services/ble';
import { colors, radii, shadows, spacing, typography } from '@/src/theme/tokens';

// ============================================================================
// Role dispatcher
// ============================================================================
export default function HomeScreen() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === 'doctor') return <DoctorHome />;
  if (user.role === 'patient_autonomous') return <AutonomousPatientHome user={user} />;
  return <MonitoredPatientHome user={user} />;
}

// ============================================================================
// Shared helpers / small components
// ============================================================================
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

/**
 * Opens WhatsApp with the given phone number. Falls back to `tel:` if the
 * device does not have WhatsApp installed.
 */
async function openWhatsApp(phone: string) {
  const digits = phone.replace(/[^0-9+]/g, '');
  const wa = `whatsapp://send?phone=${encodeURIComponent(digits)}`;
  try {
    const supported = await Linking.canOpenURL(wa);
    if (supported) {
      await Linking.openURL(wa);
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    await Linking.openURL(`tel:${digits}`);
  } catch {
    /* ignore */
  }
}

function ContactCard({ contact }: { contact: Contact }) {
  return (
    <Pressable
      style={styles.contactCard}
      onPress={() => openWhatsApp(contact.phone)}
      testID={`contact-card-${contact.id}`}
    >
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
        <Ionicons name="logo-whatsapp" size={14} color={colors.surface} />
        <Text style={styles.callText}>WhatsApp</Text>
      </View>
    </Pressable>
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

async function pickAndAnalyze(
  setAnalyzing: (b: boolean) => void,
  setToast: (t: { msg: string; type: 'error' | 'success' | 'info' }) => void,
  onPhoto: (p: WoundPhoto) => void,
) {
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
    const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!libPerm.granted) {
      setToast({ msg: 'Permissão necessária para câmera/galeria', type: 'error' });
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
    const photo = await api.post<WoundPhoto>('/wound-photos/analyze', {
      image_base64: result.assets[0].base64,
    });
    onPhoto(photo);
    setToast({ msg: 'Análise concluída!', type: 'success' });
  } catch (e: any) {
    setToast({ msg: e?.detail ?? 'Falha na análise', type: 'error' });
  } finally {
    setAnalyzing(false);
  }
}

// ============================================================================
// Monitored patient Home (uses the TERESA01 equipment)
// ============================================================================
function MonitoredPatientHome({ user }: { user: User }) {
  const router = useRouter();
  const [bleState, setBleState] = useState<ConnectionState>(bleService.getState());
  const [bleMeta, setBleMeta] = useState<ConnectionMeta>(bleService.getMeta());
  const [telemetry, setTelemetry] = useState<TeresaTelemetry | null>(bleService.getLastTelemetry());
  const [latest, setLatest] = useState<Reading | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [latestPhoto, setLatestPhoto] = useState<WoundPhoto | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [now, setNow] = useState<number>(Date.now());
  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'success' | 'info' } | null>(
    null,
  );

  // Lightweight 1 s ticker to refresh "última leitura há Xs"
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [l, a, c, p] = await Promise.all([
        api.get<Reading | null>('/readings/latest'),
        api.get<AlertItem[]>('/alerts'),
        api.get<Contact[]>('/contacts'),
        api.get<WoundPhoto | null>('/wound-photos/latest'),
      ]);
      setLatest(l);
      setAlerts(a.slice(0, 4));
      setContacts(c.slice(0, 6));
      setLatestPhoto(p);
    } catch (e: any) {
      setToast({ msg: e?.detail ?? 'Falha ao carregar dados', type: 'error' });
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Live BLE subscription — real values from ESP32 override the "latest"
  // snapshot card when connected.
  const lastPersistRef = useRef(0);
  useEffect(() => {
    const off1 = bleService.onStateChange(setBleState);
    const offMeta = bleService.onMeta(setBleMeta);
    const off2 = bleService.onTelemetry((t: TeresaTelemetry) => {
      setTelemetry(t);
      // Also feed the "latest reading" card so historic UI stays consistent.
      setLatest({
        id: `live-${Date.now()}`,
        user_id: user.id,
        temperature_c: t.temperature_c,
        humidity_pct: t.humidity_pct,
        state_system: t.state,
        timestamp: t.received_at,
      });
      // Throttled persistence to backend (one write per 30 s).
      const now = Date.now();
      if (now - lastPersistRef.current > 30_000) {
        lastPersistRef.current = now;
        api
          .post('/readings', {
            temperature_c: t.temperature_c,
            humidity_pct: t.humidity_pct,
            state_system: t.state,
            timestamp: t.received_at,
          })
          .catch(() => {
            /* silent — chart already updated locally */
          });
      }
    });
    return () => {
      off1();
      offMeta();
      off2();
    };
  }, [user.id]);

  async function onRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  const connected = bleState === 'connected';
  const reconnecting = bleState === 'reconnecting';
  const connecting = bleState === 'connecting';
  const btOff = bleState === 'bt_off';
  const unauthorized = bleState === 'unauthorized';
  const healingPct = latestPhoto?.analysis?.healing_percentage ?? 0;
  // When BLE is connected, telemetry (live sensors) wins over the backend snapshot.
  const displayTemp = connected && telemetry ? telemetry.temperature_c : latest?.temperature_c;
  const displayHum = connected && telemetry ? telemetry.humidity_pct : latest?.humidity_pct;
  const treatmentState: TreatmentState | null =
    connected && telemetry ? telemetry.state : null;

  const statusMeta = (() => {
    if (connected)
      return { color: colors.greenGood, label: 'CONECTADO', dot: colors.greenGood };
    if (connecting)
      return { color: colors.yellowObserve, label: 'CONECTANDO…', dot: colors.yellowObserve };
    if (reconnecting)
      return {
        color: colors.yellowObserve,
        label: `RECONECTANDO ${bleMeta.reconnectAttempt}/${bleMeta.maxReconnectAttempts}`,
        dot: colors.yellowObserve,
      };
    if (btOff)
      return { color: colors.redAlert, label: 'BLUETOOTH DESLIGADO', dot: colors.redAlert };
    if (unauthorized)
      return { color: colors.redAlert, label: 'PERMISSÃO NEGADA', dot: colors.redAlert };
    return { color: colors.textSecondary, label: 'DESCONECTADO', dot: colors.textDisabled };
  })();

  const lastFrameAgeMs = bleMeta.lastFrameAt
    ? Math.max(0, now - new Date(bleMeta.lastFrameAt).getTime())
    : null;
  const lastFrameAgeLabel = lastFrameAgeMs != null ? formatAgeShort(lastFrameAgeMs) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerBlock}>
          <Text style={styles.hello}>Olá, {user.name.split(' ')[0]} 👋</Text>
          <Text style={styles.subhello}>Acompanhe seu tratamento em tempo real</Text>
        </View>

        {/* BLE / Equipment status */}
        <Card padded testID="card-equipment-status">
          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <View
                style={[styles.statusDot, { backgroundColor: statusMeta.dot }]}
                testID="status-dot"
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>Sistema de aquecimento</Text>
                <Text
                  style={[styles.statusSub, { color: statusMeta.color }]}
                  testID="status-text"
                >
                  {statusMeta.label}
                </Text>
                {connected && lastFrameAgeLabel && (
                  <Text style={styles.statusHint} testID="status-last-rx">
                    Última leitura {lastFrameAgeLabel} · {bleMeta.framesReceived} frames
                  </Text>
                )}
                {reconnecting && (
                  <Text style={styles.statusHint}>
                    Mantenha o equipamento ligado e próximo.
                  </Text>
                )}
              </View>
            </View>
            <Pressable
              onPress={() => router.push('/(app)/connect')}
              hitSlop={10}
              style={styles.statusAction}
              testID="btn-manage-connection"
            >
              <Ionicons name="bluetooth" size={18} color={colors.primary} />
              <Text style={styles.statusActionText}>
                {connected ? 'Gerenciar' : 'Conectar'}
              </Text>
            </Pressable>
          </View>

          <View style={{ marginTop: spacing.sm }}>
            <StateBadge state={treatmentState} connected={connected} testID="treatment-state" />
          </View>
        </Card>

        {/* Environmental cards (real data from MLX + AHT10) */}
        <View style={styles.envRow}>
          <MetricCard
            testID="metric-temperature"
            icon="thermometer-outline"
            iconColor={colors.redAlert}
            iconBg="#FEE2E2"
            label="Temperatura"
            value={displayTemp !== undefined && displayTemp !== null ? displayTemp.toFixed(1) : '—'}
            unit="°C"
          />
          <MetricCard
            testID="metric-humidity"
            icon="water-outline"
            iconColor={colors.primary}
            iconBg={colors.primarySoft}
            label="Umidade"
            value={displayHum !== undefined && displayHum !== null ? displayHum.toFixed(0) : '—'}
            unit="%"
          />
        </View>

        {/* Wound analysis */}
        <Card padded testID="card-wound-analysis" title="Análise da ferida">
          <View style={styles.analysisRow}>
            <Pressable
              onPress={() => pickAndAnalyze(setAnalyzing, setToast, (p) => {
                setLatestPhoto(p);
                router.push(`/(app)/wound-analysis?id=${p.id}`);
              })}
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
                {analyzing ? 'Analisando com IA…' : 'Ferramenta de apoio clínico'}
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
              onPress={() => router.push(`/(app)/wound-analysis?id=${latestPhoto.id}`)}
              testID="btn-view-analysis"
            >
              <Text style={styles.viewAnalysisText}>Ver análise completa</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </Pressable>
          )}
        </Card>

        {/* Alerts */}
        <Card padded title="Alertas rápidos" testID="card-alerts">
          {alerts.length === 0 ? (
            <EmptyState
              icon="checkmark-circle-outline"
              title="Nenhum alerta agora"
              description="Avisos do equipamento e do médico aparecem aqui em tempo real."
              testID="alerts-empty"
            />
          ) : (
            <View style={styles.alertsList}>
              {alerts.map((a) => <AlertRow key={a.id} alert={a} />)}
            </View>
          )}
        </Card>

        {/* Contacts */}
        <Card padded title="Contatos rápidos" testID="card-contacts">
          {contacts.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="Adicione seus contatos"
              description="Médicos, enfermeiros e familiares para chamar via WhatsApp."
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
              {contacts.map((c) => <ContactCard key={c.id} contact={c} />)}
            </ScrollView>
          )}
        </Card>

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {toast && (
        <Toast visible message={toast.msg} type={toast.type} onHide={() => setToast(null)} />
      )}
    </SafeAreaView>
  );
}

// ============================================================================
// Autonomous patient Home (NO equipment, NO temp/hum, NO BLE)
// ============================================================================
function AutonomousPatientHome({ user }: { user: User }) {
  const router = useRouter();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [latestPhoto, setLatestPhoto] = useState<WoundPhoto | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'success' | 'info' } | null>(
    null,
  );

  const loadAll = useCallback(async () => {
    try {
      const [a, c, p] = await Promise.all([
        api.get<AlertItem[]>('/alerts'),
        api.get<Contact[]>('/contacts'),
        api.get<WoundPhoto | null>('/wound-photos/latest'),
      ]);
      setAlerts(a.slice(0, 4));
      setContacts(c.slice(0, 6));
      setLatestPhoto(p);
    } catch (e: any) {
      setToast({ msg: e?.detail ?? 'Falha ao carregar dados', type: 'error' });
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function onRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

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
          <Text style={styles.hello}>Olá, {user.name.split(' ')[0]} 👋</Text>
          <Text style={styles.subhello}>
            Acompanhe sua ferida pela análise fotográfica
          </Text>
        </View>

        <Card padded testID="card-autonomous-info">
          <View style={styles.infoRow}>
            <Ionicons name="camera" size={22} color={colors.primary} />
            <Text style={styles.infoText}>
              Você está no modo autônomo: utilize a câmera para registrar e
              acompanhar a evolução da ferida com apoio de IA.
            </Text>
          </View>
        </Card>

        <Card padded testID="card-wound-analysis" title="Análise da ferida">
          <View style={styles.analysisRow}>
            <Pressable
              onPress={() => pickAndAnalyze(setAnalyzing, setToast, (p) => {
                setLatestPhoto(p);
                router.push(`/(app)/wound-analysis?id=${p.id}`);
              })}
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
                {analyzing ? 'Analisando com IA…' : 'Ferramenta de apoio clínico'}
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
              onPress={() => router.push(`/(app)/wound-analysis?id=${latestPhoto.id}`)}
              testID="btn-view-analysis"
            >
              <Text style={styles.viewAnalysisText}>Ver análise completa</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </Pressable>
          )}
        </Card>

        <Card padded title="Alertas rápidos" testID="card-alerts">
          {alerts.length === 0 ? (
            <EmptyState
              icon="checkmark-circle-outline"
              title="Nenhum alerta agora"
              description="Avisos do sistema e do seu médico aparecem aqui."
              testID="alerts-empty"
            />
          ) : (
            <View style={styles.alertsList}>
              {alerts.map((a) => <AlertRow key={a.id} alert={a} />)}
            </View>
          )}
        </Card>

        <Card padded title="Contatos rápidos" testID="card-contacts">
          {contacts.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="Adicione seus contatos"
              description="Médicos, enfermeiros e familiares para chamar via WhatsApp."
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
              {contacts.map((c) => <ContactCard key={c.id} contact={c} />)}
            </ScrollView>
          )}
        </Card>

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {toast && (
        <Toast visible message={toast.msg} type={toast.type} onHide={() => setToast(null)} />
      )}
    </SafeAreaView>
  );
}

// ============================================================================
// Doctor Home — select patient dropdown + patient summary
// ============================================================================
function DoctorHome() {
  const router = useRouter();
  const { user } = useAuth();
  const [patients, setPatients] = useState<User[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [selected, setSelected] = useState<User | null>(null);
  const [data, setData] = useState<any | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const loadPatients = useCallback(async () => {
    setLoadingPatients(true);
    try {
      const list = await api.get<User[]>('/doctor/patients');
      setPatients(list);
      if (list.length && !selected) setSelected(list[0]);
    } catch {
      setPatients([]);
    } finally {
      setLoadingPatients(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  useEffect(() => {
    if (!selected) {
      setData(null);
      return;
    }
    (async () => {
      setLoadingData(true);
      try {
        const d = await api.get<any>(`/doctor/patient/${selected.id}/data`);
        setData(d);
      } catch {
        setData(null);
      } finally {
        setLoadingData(false);
      }
    })();
  }, [selected]);

  const latestPhoto: WoundPhoto | null = data?.photos?.[0] ?? null;
  const latest: Reading | null = data?.latest_reading ?? null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerBlock}>
          <Text style={styles.hello}>
            {doctorGreeting(user?.name)}
          </Text>
          <Text style={styles.subhello}>Visão clínica dos seus pacientes</Text>
        </View>

        {/* Patient selector */}
        <Card padded testID="doctor-patient-picker">
          <Text style={styles.pickerLabel}>Selecionar paciente</Text>
          <Pressable
            onPress={() => setPickerOpen(!pickerOpen)}
            style={styles.pickerBtn}
            testID="btn-open-picker"
          >
            <Ionicons name="person-outline" size={20} color={colors.primary} />
            <Text style={styles.pickerText}>
              {selected ? selected.name : 'Nenhum paciente'}
            </Text>
            <Ionicons
              name={pickerOpen ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>
          {pickerOpen && (
            <View style={styles.pickerList} testID="patient-picker-list">
              {loadingPatients ? (
                <ActivityIndicator color={colors.primary} style={{ padding: spacing.md }} />
              ) : patients.length === 0 ? (
                <View style={{ padding: spacing.md }}>
                  <Text style={styles.pickerEmpty}>
                    Nenhum paciente vinculado. Vá até Perfil para adicionar.
                  </Text>
                </View>
              ) : (
                patients.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      setSelected(p);
                      setPickerOpen(false);
                    }}
                    style={[
                      styles.pickerItem,
                      selected?.id === p.id && styles.pickerItemActive,
                    ]}
                    testID={`picker-item-${p.id}`}
                  >
                    <Text style={styles.pickerItemName}>{p.name}</Text>
                    <Text style={styles.pickerItemRole}>
                      {p.role === 'patient_autonomous' ? 'Autônomo' : 'Monitorado'}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
          )}
        </Card>

        {selected && (
          <>
            {/* Patient header */}
            <Card padded testID="doctor-patient-header">
              <View style={styles.doctorHeaderRow}>
                <View style={styles.doctorAvatar}>
                  <Text style={styles.doctorAvatarText}>
                    {selected.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{selected.name}</Text>
                  <Text style={styles.subtle}>
                    {selected.role === 'patient_autonomous'
                      ? 'Paciente autônomo'
                      : 'Paciente monitorado'}
                    {selected.age ? ` · ${selected.age} anos` : ''}
                  </Text>
                  <Text style={styles.subtle}>
                    {selected.lesion_type ?? 'Lesão não informada'}
                  </Text>
                </View>
              </View>
            </Card>

            {/* Env readings — only for monitored */}
            {selected.role !== 'patient_autonomous' && (
              <View style={styles.envRow}>
                <MetricCard
                  testID="doctor-metric-temperature"
                  icon="thermometer-outline"
                  iconColor={colors.redAlert}
                  iconBg="#FEE2E2"
                  label="Temperatura"
                  value={latest?.temperature_c?.toFixed(1) ?? '—'}
                  unit="°C"
                />
                <MetricCard
                  testID="doctor-metric-humidity"
                  icon="water-outline"
                  iconColor={colors.primary}
                  iconBg={colors.primarySoft}
                  label="Umidade"
                  value={latest?.humidity_pct?.toFixed(0) ?? '—'}
                  unit="%"
                />
              </View>
            )}

            {/* Latest photo + healing */}
            <Card padded title="Última análise da ferida" testID="doctor-latest-wound">
              {loadingData ? (
                <ActivityIndicator color={colors.primary} />
              ) : latestPhoto ? (
                <Pressable
                  onPress={() => router.push(`/(app)/wound-analysis?id=${latestPhoto.id}`)}
                  style={styles.doctorPhotoRow}
                  testID="btn-view-patient-photo"
                >
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${latestPhoto.image_base64}` }}
                    style={styles.doctorPhoto}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.doctorPhotoLabel}>
                      {new Date(latestPhoto.timestamp).toLocaleString('pt-BR')}
                    </Text>
                    {latestPhoto.analysis && (
                      <>
                        <Text style={styles.doctorPhotoValue}>
                          {latestPhoto.analysis.healing_percentage}% cicatrizado
                        </Text>
                        <Text style={styles.subtle}>
                          Área ~ {latestPhoto.analysis.estimated_area_cm2.toFixed(1)} cm²
                        </Text>
                      </>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textDisabled} />
                </Pressable>
              ) : (
                <EmptyState
                  icon="images-outline"
                  title="Sem fotos registradas"
                  description="O paciente ainda não enviou análises."
                />
              )}
            </Card>

            {/* Stats */}
            <Card padded title="Estatísticas" testID="doctor-stats">
              <StatRow label="Fotos registradas" value={String(data?.stats?.photo_count ?? 0)} />
              <StatRow label="Sessões realizadas" value={String(data?.stats?.session_count ?? 0)} />
              <StatRow
                label="Última cicatrização"
                value={
                  data?.stats?.latest_healing != null
                    ? `${data.stats.latest_healing}%`
                    : '—'
                }
              />
            </Card>

            {/* Quick action: send alert */}
            <PrimaryButton
              label="Enviar aviso ao paciente"
              variant="secondary"
              onPress={() => router.push(`/(app)/send-alert?patientId=${selected.id}`)}
              testID="btn-send-alert"
            />
          </>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function doctorGreeting(name?: string): string {
  if (!name) return 'Olá! 👋';
  const first = name.split(' ')[0] ?? name;
  // If the user already typed "Dr." / "Dra." as part of their name, don't duplicate it.
  if (/^(dr\.?|dra\.?)/i.test(first)) {
    return `Olá, ${name} 👋`;
  }
  return `Olá, Dr(a). ${first} 👋`;
}

function formatAgeShort(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  return `há ${h}h`;
}

// ============================================================================
// Styles
// ============================================================================
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    padding: spacing.container,
    gap: spacing.md,
  },
  headerBlock: { marginBottom: spacing.xs },
  hello: { ...typography.h2, color: colors.textPrimary },
  subhello: { ...typography.body, color: colors.textSecondary, marginTop: 2 },

  // Equipment status
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  statusTitle: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
  statusSub: { ...typography.caption, fontWeight: '700', marginTop: 2 },
  statusHint: { ...typography.caption, color: colors.textSecondary, marginTop: 2, fontWeight: '500' },
  statusAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
  },
  statusActionText: { ...typography.caption, fontWeight: '700', color: colors.primary },

  // Env cards
  envRow: { flexDirection: 'row', gap: spacing.md },
  metricCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    ...shadows.soft,
  },
  metricIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  metricLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  metricValRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 4 },
  metricValue: { ...typography.metric, fontSize: 32, lineHeight: 38, color: colors.textPrimary },
  metricUnit: { ...typography.h4, color: colors.textSecondary, marginBottom: 6 },

  // Autonomous info
  infoRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  infoText: { flex: 1, ...typography.body, color: colors.textSecondary, lineHeight: 20 },

  // Wound analysis
  analysisRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cameraBtn: {
    width: 82, height: 82, borderRadius: 41,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', ...shadows.floating,
  },
  cameraBtnPressed: { opacity: 0.85 },
  cameraBtnDisabled: { opacity: 0.7 },
  cameraImage: { width: 82, height: 82 },
  analysisText: { flex: 1 },
  analysisLabel: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  analysisSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  viewAnalysisBtn: {
    marginTop: spacing.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
  },
  viewAnalysisText: { ...typography.body, color: colors.primary, fontWeight: '600' },

  // Alerts
  alertsList: { gap: spacing.sm },
  alertRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radii.md,
  },
  alertIcon: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  alertTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  alertDesc: { ...typography.caption, color: colors.textSecondary },

  // Contacts
  contactScroll: { gap: spacing.md, paddingRight: spacing.md },
  contactCard: {
    width: 130,
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  contactAvatarWrap: { marginBottom: spacing.xs },
  contactAvatar: { width: 52, height: 52, borderRadius: 26 },
  contactAvatarPlaceholder: {
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  contactAvatarText: { color: colors.surface, ...typography.h4 },
  contactName: { ...typography.body, color: colors.textPrimary, fontWeight: '600', textAlign: 'center' },
  contactRole: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xs },
  callBtn: {
    marginTop: 4,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    backgroundColor: '#25D366',
    borderRadius: radii.pill,
  },
  callText: { ...typography.caption, color: colors.surface, fontWeight: '700' },

  // Doctor picker
  pickerLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600', marginBottom: 6 },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  pickerText: { flex: 1, ...typography.bodyLarge, color: colors.textPrimary, fontWeight: '600' },
  pickerList: {
    marginTop: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  pickerItem: {
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  pickerItemActive: { backgroundColor: colors.primarySoft },
  pickerItemName: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  pickerItemRole: { ...typography.caption, color: colors.textSecondary },
  pickerEmpty: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },

  // Doctor header
  doctorHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  doctorAvatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  doctorAvatarText: { color: colors.surface, ...typography.h3 },
  name: { ...typography.h4, color: colors.textPrimary },
  subtle: { ...typography.caption, color: colors.textSecondary },

  // Doctor photo
  doctorPhotoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  doctorPhoto: { width: 80, height: 80, borderRadius: radii.md },
  doctorPhotoLabel: { ...typography.caption, color: colors.textSecondary },
  doctorPhotoValue: { ...typography.h4, color: colors.textPrimary, marginTop: 2 },

  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  statLabel: { ...typography.body, color: colors.textSecondary },
  statValue: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
});
