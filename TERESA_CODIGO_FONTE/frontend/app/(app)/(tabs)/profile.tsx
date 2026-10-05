import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/src/components/Card';
import { CircularProgress } from '@/src/components/CircularProgress';
import { EmptyState } from '@/src/components/EmptyState';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { Toast } from '@/src/components/Toast';
import { TopBar } from '@/src/components/TopBar';
import { useAuth } from '@/src/contexts/AuthContext';
import {
  api,
  type Contact,
  type SessionRecord,
  type User,
  type WoundPhoto,
} from '@/src/services/api';
import { colors, radii, shadows, spacing, typography } from '@/src/theme/tokens';

export default function ProfileScreen() {
  const { user, logout, refresh } = useAuth();
  const router = useRouter();

  if (!user) return null;

  if (user.role === 'doctor') {
    return <DoctorProfile onLogout={handleLogout(logout, router)} />;
  }
  return <PatientProfile user={user} onRefresh={refresh} onLogout={handleLogout(logout, router)} />;
}

function handleLogout(logout: () => Promise<void>, router: ReturnType<typeof useRouter>) {
  return async () => {
    await logout();
    router.replace('/login');
  };
}

// ============================== PATIENT ==============================
function PatientProfile({
  user,
  onRefresh,
  onLogout,
}: {
  user: User;
  onRefresh: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [photos, setPhotos] = useState<WoundPhoto[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, p, c] = await Promise.all([
        api.get<SessionRecord[]>('/sessions'),
        api.get<WoundPhoto[]>('/wound-photos'),
        api.get<Contact[]>('/contacts'),
      ]);
      setSessions(s);
      setPhotos(p);
      setContacts(c);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function refreshAll() {
    setRefreshing(true);
    await Promise.all([onRefresh(), load()]);
    setRefreshing(false);
  }

  const latestHealing = photos[0]?.analysis?.healing_percentage ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Role indicator */}
        <View style={styles.roleBar} testID="profile-role-patient">
          <Ionicons name="person" size={16} color={colors.primary} />
          <Text style={styles.roleBarText}>Perfil do Paciente</Text>
        </View>

        <Card padded testID="patient-header-card">
          <View style={styles.headerRow}>
            <View style={styles.avatar}>
              {user.photo_base64 ? (
                <Image
                  source={{ uri: `data:image/jpeg;base64,${user.photo_base64}` }}
                  style={styles.avatarImg}
                />
              ) : (
                <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user.name}</Text>
              <Text style={styles.subtle}>{user.email}</Text>
              <Text style={styles.id}>ID: {user.id.slice(0, 8)}</Text>
            </View>
            <Pressable
              onPress={() => setEditOpen(true)}
              style={styles.editBtn}
              testID="btn-edit-profile"
            >
              <Ionicons name="create-outline" size={20} color={colors.primary} />
            </Pressable>
          </View>
        </Card>

        {/* Healing progress */}
        <Card padded title="Evolução da cicatrização" testID="patient-healing-card">
          <View style={styles.healingRow}>
            <CircularProgress percentage={latestHealing} size={110} strokeWidth={12} label="Cicatrizado" />
            <View style={{ flex: 1, gap: spacing.sm }}>
              <StatRow label="Sessões realizadas" value={String(sessions.length)} />
              <StatRow label="Fotos registradas" value={String(photos.length)} />
              <StatRow
                label="Início do tratamento"
                value={user.treatment_start ? formatDate(user.treatment_start) : '—'}
              />
            </View>
          </View>
        </Card>

        {/* Health data */}
        <Card padded title="Dados de saúde" testID="patient-health-card">
          <FieldRow label="Idade" value={user.age ? `${user.age} anos` : '—'} />
          <FieldRow label="Sexo" value={user.sex ?? '—'} />
          <FieldRow label="Tipo de lesão" value={user.lesion_type ?? '—'} />
          <FieldRow label="Local da lesão" value={user.lesion_location ?? '—'} />
          <FieldRow
            label="Peso / Altura"
            value={
              user.weight_kg || user.height_cm
                ? `${user.weight_kg ?? '—'} kg / ${user.height_cm ?? '—'} cm`
                : '—'
            }
          />
          <FieldRow label="Diabetes" value={boolToPt(user.diabetes)} />
          <FieldRow label="Hipertensão" value={boolToPt(user.hypertension)} />
          <FieldRow label="Alergias" value={user.allergies ?? '—'} last />
          <FieldRow label="Medicamentos" value={user.medications ?? '—'} last />
        </Card>

        {/* Photos history */}
        <Card padded title="Histórico de fotos" testID="patient-photos-card">
          {photos.length === 0 ? (
            <EmptyState
              icon="images-outline"
              title="Nenhuma foto ainda"
              description="Capture uma foto na Home para começar seu histórico visual."
            />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.photoRow}>
                {photos.slice(0, 12).map((p) => (
                  <View key={p.id} style={styles.photoItem}>
                    <Image
                      source={{ uri: `data:image/jpeg;base64,${p.image_base64}` }}
                      style={styles.photoImg}
                    />
                    <Text style={styles.photoDate}>{formatDate(p.timestamp)}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </Card>

        {/* Contacts */}
        <Card
          padded
          title="Contatos de emergência"
          testID="patient-contacts-card"
          action={
            <Pressable
              onPress={() => setContactOpen(true)}
              testID="btn-add-contact"
              style={styles.smallBtn}
            >
              <Ionicons name="add" size={18} color={colors.primary} />
            </Pressable>
          }
        >
          {contacts.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="Nenhum contato"
              description="Adicione médicos, enfermeiros e familiares para acesso rápido."
              testID="contacts-empty"
            />
          ) : (
            contacts.map((c) => (
              <View key={c.id} style={styles.contactItem} testID={`contact-item-${c.id}`}>
                <View style={styles.contactMiniAvatar}>
                  <Text style={styles.contactMiniAvatarText}>
                    {c.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactItemName}>{c.name}</Text>
                  <Text style={styles.contactItemRole}>
                    {c.role} · {c.phone}
                  </Text>
                </View>
                <Pressable
                  onPress={() => deleteContact(c.id, load, setToast)}
                  hitSlop={8}
                  testID={`btn-remove-contact-${c.id}`}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.redAlert} />
                </Pressable>
              </View>
            ))
          )}
        </Card>

        <PrimaryButton
          label="Sair da conta"
          variant="outline"
          onPress={onLogout}
          testID="btn-logout"
        />
        <View style={{ height: spacing.xl }} />
      </ScrollView>

      <EditProfileModal
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        user={user}
        onSaved={() => {
          setEditOpen(false);
          setToast({ msg: 'Perfil atualizado', type: 'success' });
          onRefresh();
        }}
      />

      <ContactFormModal
        visible={contactOpen}
        onClose={() => setContactOpen(false)}
        onSaved={() => {
          setContactOpen(false);
          setToast({ msg: 'Contato adicionado', type: 'success' });
          load();
        }}
      />

      {toast && (
        <Toast visible message={toast.msg} type={toast.type} onHide={() => setToast(null)} />
      )}
    </SafeAreaView>
  );
}

async function deleteContact(
  id: string,
  load: () => Promise<void>,
  setToast: (t: { msg: string; type: 'success' | 'error' }) => void,
) {
  try {
    await api.del(`/contacts/${id}`);
    await load();
    setToast({ msg: 'Contato removido', type: 'success' });
  } catch {
    setToast({ msg: 'Falha ao remover', type: 'error' });
  }
}

// ============================== DOCTOR ==============================
function DoctorProfile({ onLogout }: { onLogout: () => Promise<void> }) {
  const { user } = useAuth();
  const [patients, setPatients] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{
    photos: WoundPhoto[];
    sessions: SessionRecord[];
  } | null>(null);
  const [addPatientOpen, setAddPatientOpen] = useState(false);
  const [toastDoc, setToastDoc] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const list = await api.get<User[]>(`/doctor/patients${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setPatients(list);
    } catch {
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), 250);
    return () => clearTimeout(t);
  }, [search, load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.roleBar} testID="profile-role-doctor">
          <Ionicons name="medkit" size={16} color={colors.primary} />
          <Text style={styles.roleBarText}>Perfil do Médico</Text>
        </View>

        {user && (
          <Card padded testID="doctor-header-card">
            <View style={styles.headerRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{user.name}</Text>
                <Text style={styles.subtle}>{user.email}</Text>
                <View style={styles.chipsRow}>
                  {user.crm && (
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>CRM {user.crm}</Text>
                    </View>
                  )}
                  {user.specialty && (
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>{user.specialty}</Text>
                    </View>
                  )}
                </View>
                {user.hospital && <Text style={styles.subtle}>{user.hospital}</Text>}
              </View>
            </View>
          </Card>
        )}

        <Card
          padded
          title="Meus pacientes"
          testID="doctor-patients-card"
          action={
            <Pressable
              onPress={() => setAddPatientOpen(true)}
              style={styles.smallBtn}
              testID="btn-add-patient"
            >
              <Ionicons name="add" size={18} color={colors.primary} />
            </Pressable>
          }
        >
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.textDisabled} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar paciente…"
              placeholderTextColor={colors.textDisabled}
              style={styles.searchInput}
              testID="doctor-search"
            />
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
          ) : patients.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title={search ? 'Nenhum resultado' : 'Nenhum paciente vinculado'}
              description="Toque em + para adicionar seu primeiro paciente."
            />
          ) : (
            patients.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => selectPatient(p, setSelected, setDetail)}
                style={[
                  styles.patientItem,
                  selected?.id === p.id && styles.patientItemActive,
                ]}
                testID={`patient-item-${p.id}`}
              >
                <View style={styles.contactMiniAvatar}>
                  <Text style={styles.contactMiniAvatarText}>
                    {p.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactItemName}>{p.name}</Text>
                  <Text style={styles.contactItemRole}>
                    {p.lesion_type ?? 'Sem lesão definida'}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.textDisabled}
                />
              </Pressable>
            ))
          )}
        </Card>

        {selected && (
          <Card padded title={`Paciente: ${selected.name}`} testID="doctor-selected-card">
            <FieldRow label="E-mail" value={selected.email} />
            <FieldRow
              label="Tipo"
              value={
                selected.role === 'patient_autonomous' ? 'Autônomo' : 'Monitorado'
              }
            />
            <FieldRow label="Idade" value={selected.age ? `${selected.age} anos` : '—'} />
            <FieldRow label="Tipo de lesão" value={selected.lesion_type ?? '—'} />
            <FieldRow label="Local" value={selected.lesion_location ?? '—'} />
            <FieldRow label="Diabetes" value={boolToPt(selected.diabetes)} />
            <FieldRow label="Hipertensão" value={boolToPt(selected.hypertension)} last />
            {detail && (
              <>
                <View style={styles.divider} />
                <StatRow label="Sessões" value={String(detail.sessions.length)} />
                <StatRow label="Fotos" value={String(detail.photos.length)} />
                {detail.photos[0]?.analysis && (
                  <StatRow
                    label="Última cicatrização"
                    value={`${detail.photos[0].analysis.healing_percentage}%`}
                  />
                )}
              </>
            )}
          </Card>
        )}

        <PrimaryButton
          label="Sair da conta"
          variant="outline"
          onPress={onLogout}
          testID="btn-logout"
        />
        <View style={{ height: spacing.xl }} />
      </ScrollView>

      <AddPatientModal
        visible={addPatientOpen}
        onClose={() => setAddPatientOpen(false)}
        onCreated={() => {
          setAddPatientOpen(false);
          setToastDoc({ msg: 'Paciente criado e vinculado!', type: 'success' });
          load(search);
        }}
      />

      {toastDoc && (
        <Toast
          visible
          message={toastDoc.msg}
          type={toastDoc.type}
          onHide={() => setToastDoc(null)}
        />
      )}
    </SafeAreaView>
  );
}

async function selectPatient(
  p: User,
  setSelected: (u: User) => void,
  setDetail: (d: { photos: WoundPhoto[]; sessions: SessionRecord[] }) => void,
) {
  setSelected(p);
  try {
    const data = await api.get<{ photos: WoundPhoto[]; sessions: SessionRecord[] }>(
      `/doctor/patient/${p.id}/data`,
    );
    setDetail({ photos: data.photos ?? [], sessions: data.sessions ?? [] });
  } catch {
    setDetail({ photos: [], sessions: [] });
  }
}

// --- Add patient modal (doctor) -----------------------------------------
function AddPatientModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'patient_monitored' | 'patient_autonomous'>(
    'patient_monitored',
  );
  const [age, setAge] = useState('');
  const [lesionType, setLesionType] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName('');
      setEmail('');
      setPassword('');
      setRole('patient_monitored');
      setAge('');
      setLesionType('');
      setErr(null);
    }
  }, [visible]);

  async function save() {
    setErr(null);
    if (!name || !email || password.length < 6) {
      setErr('Preencha nome, e-mail e senha (≥ 6)');
      return;
    }
    setSaving(true);
    try {
      await api.post<User>('/doctor/patients', {
        name,
        email: email.trim(),
        password,
        role,
        age: age ? parseInt(age, 10) : undefined,
        lesion_type: lesionType || undefined,
      });
      onCreated();
    } catch (e: any) {
      setErr(e?.detail ?? 'Falha ao criar paciente');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalPanel}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Adicionar paciente</Text>
            <Pressable onPress={onClose} testID="add-patient-close">
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalScroll}
            bottomOffset={24}
          >
            <View style={styles.roleToggle}>
              <Pressable
                onPress={() => setRole('patient_monitored')}
                style={[styles.roleToggleBtn, role === 'patient_monitored' && styles.roleToggleActive]}
                testID="add-patient-monitored"
              >
                <Text
                  style={[
                    styles.roleToggleText,
                    role === 'patient_monitored' && styles.roleToggleTextActive,
                  ]}
                >
                  Monitorado
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setRole('patient_autonomous')}
                style={[styles.roleToggleBtn, role === 'patient_autonomous' && styles.roleToggleActive]}
                testID="add-patient-autonomous"
              >
                <Text
                  style={[
                    styles.roleToggleText,
                    role === 'patient_autonomous' && styles.roleToggleTextActive,
                  ]}
                >
                  Autônomo
                </Text>
              </Pressable>
            </View>

            <InputField
              label="Nome completo"
              defaultValue=""
              onChange={setName}
              testID="add-patient-name"
            />
            <InputField
              label="E-mail de acesso"
              defaultValue=""
              onChange={setEmail}
              keyboardType="default"
              testID="add-patient-email"
            />
            <InputField
              label="Senha inicial (≥ 6)"
              defaultValue=""
              onChange={setPassword}
              testID="add-patient-password"
            />
            <InputField
              label="Idade (opcional)"
              defaultValue=""
              onChange={setAge}
              keyboardType="numeric"
              testID="add-patient-age"
            />
            <InputField
              label="Tipo de lesão (opcional)"
              defaultValue=""
              onChange={setLesionType}
              testID="add-patient-lesion"
            />
            {err && <Text style={styles.errText}>{err}</Text>}
          </KeyboardAwareScrollView>

          <View style={styles.modalFooter}>
            <PrimaryButton
              label="Criar paciente"
              onPress={save}
              loading={saving}
              testID="btn-save-patient"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ============================== SHARED ==============================
function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function FieldRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.fieldRow, last && styles.fieldRowLast]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function boolToPt(v?: boolean | null): string {
  if (v === true) return 'Sim';
  if (v === false) return 'Não';
  return '—';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ---------------- Edit profile modal ----------------
function EditProfileModal({
  visible,
  onClose,
  user,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  user: User;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<User>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setForm({});
  }, [visible]);

  function update<K extends keyof User>(k: K, v: User[K] | undefined) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      await api.patch<User>('/auth/me', form);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalPanel}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Editar perfil</Text>
            <Pressable onPress={onClose} testID="edit-close">
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalScroll}
            bottomOffset={24}
          >
            {user.role !== 'doctor' ? (
              <>
                <InputField
                  label="Idade"
                  keyboardType="numeric"
                  defaultValue={user.age?.toString()}
                  onChange={(v) => update('age', v ? parseInt(v, 10) : undefined)}
                  testID="edit-age"
                />
                <InputField
                  label="Sexo"
                  defaultValue={user.sex ?? ''}
                  onChange={(v) => update('sex', v)}
                  testID="edit-sex"
                />
                <InputField
                  label="Tipo de lesão"
                  defaultValue={user.lesion_type ?? ''}
                  onChange={(v) => update('lesion_type', v)}
                  testID="edit-lesion-type"
                />
                <InputField
                  label="Local da lesão"
                  defaultValue={user.lesion_location ?? ''}
                  onChange={(v) => update('lesion_location', v)}
                  testID="edit-lesion-location"
                />
                <InputField
                  label="Peso (kg)"
                  keyboardType="numeric"
                  defaultValue={user.weight_kg?.toString()}
                  onChange={(v) => update('weight_kg', v ? parseFloat(v) : undefined)}
                  testID="edit-weight"
                />
                <InputField
                  label="Altura (cm)"
                  keyboardType="numeric"
                  defaultValue={user.height_cm?.toString()}
                  onChange={(v) => update('height_cm', v ? parseFloat(v) : undefined)}
                  testID="edit-height"
                />
                <InputField
                  label="Alergias"
                  defaultValue={user.allergies ?? ''}
                  onChange={(v) => update('allergies', v)}
                  testID="edit-allergies"
                />
                <InputField
                  label="Medicamentos"
                  defaultValue={user.medications ?? ''}
                  onChange={(v) => update('medications', v)}
                  testID="edit-medications"
                />
              </>
            ) : (
              <>
                <InputField
                  label="CRM"
                  defaultValue={user.crm ?? ''}
                  onChange={(v) => update('crm', v)}
                  testID="edit-crm"
                />
                <InputField
                  label="Especialidade"
                  defaultValue={user.specialty ?? ''}
                  onChange={(v) => update('specialty', v)}
                  testID="edit-specialty"
                />
                <InputField
                  label="Hospital"
                  defaultValue={user.hospital ?? ''}
                  onChange={(v) => update('hospital', v)}
                  testID="edit-hospital"
                />
              </>
            )}
          </KeyboardAwareScrollView>

          <View style={styles.modalFooter}>
            <PrimaryButton
              label="Salvar"
              onPress={save}
              loading={saving}
              testID="edit-save"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------------- Contact form modal ----------------
function ContactFormModal({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName('');
      setRole('');
      setPhone('');
    }
  }, [visible]);

  async function save() {
    if (!name || !phone) return;
    setSaving(true);
    try {
      await api.post<Contact>('/contacts', { name, role, phone });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalPanel}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Novo contato</Text>
            <Pressable onPress={onClose} testID="contact-close">
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalScroll}
            bottomOffset={24}
          >
            <InputField
              label="Nome"
              defaultValue=""
              onChange={setName}
              testID="contact-name"
            />
            <InputField
              label="Função / Relação"
              defaultValue=""
              onChange={setRole}
              testID="contact-role"
            />
            <InputField
              label="Telefone"
              keyboardType="phone-pad"
              defaultValue=""
              onChange={setPhone}
              testID="contact-phone"
            />
          </KeyboardAwareScrollView>

          <View style={styles.modalFooter}>
            <PrimaryButton
              label="Adicionar"
              onPress={save}
              loading={saving}
              testID="contact-save"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function InputField({
  label,
  defaultValue,
  onChange,
  keyboardType,
  testID,
}: {
  label: string;
  defaultValue?: string;
  onChange: (v: string) => void;
  keyboardType?: 'default' | 'numeric' | 'phone-pad';
  testID?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? '');
  useEffect(() => setValue(defaultValue ?? ''), [defaultValue]);
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(v) => {
          setValue(v);
          onChange(v);
        }}
        keyboardType={keyboardType}
        placeholderTextColor={colors.textDisabled}
        style={styles.input}
        testID={testID}
      />
    </View>
  );
}

// ============================== STYLES ==============================
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    padding: spacing.container,
    gap: spacing.md,
  },
  roleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  roleBarText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: 72,
    height: 72,
  },
  avatarText: {
    color: colors.surface,
    fontSize: 28,
    fontWeight: '700',
  },
  name: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  subtle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  id: {
    ...typography.caption,
    color: colors.textDisabled,
    marginTop: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  chip: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  chipText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '600',
  },
  editBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  healingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  statLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  statValue: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.md,
  },
  fieldRowLast: {
    borderBottomWidth: 0,
  },
  fieldLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  fieldValue: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
    textAlign: 'right',
  },
  photoRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  photoItem: {
    alignItems: 'center',
    gap: 4,
  },
  photoImg: {
    width: 88,
    height: 88,
    borderRadius: radii.md,
  },
  photoDate: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  contactMiniAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactMiniAvatarText: {
    color: colors.surface,
    ...typography.h4,
  },
  contactItemName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  contactItemRole: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    ...typography.body,
    color: colors.textPrimary,
  },
  patientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    marginBottom: 4,
  },
  patientItemActive: {
    backgroundColor: colors.primarySoft,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalPanel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    ...shadows.medium,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderLight,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  modalScroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  modalFooter: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  inputLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 6,
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
  roleToggle: {
    flexDirection: 'row',
    backgroundColor: colors.primarySoft,
    padding: 4,
    borderRadius: radii.pill,
    gap: 4,
    marginBottom: spacing.md,
  },
  roleToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  roleToggleActive: {
    backgroundColor: colors.primary,
  },
  roleToggleText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  roleToggleTextActive: {
    color: colors.surface,
  },
  errText: {
    ...typography.caption,
    color: colors.redAlert,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
