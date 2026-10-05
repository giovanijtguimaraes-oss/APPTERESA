import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';

import { Card } from '@/src/components/Card';
import { Toast } from '@/src/components/Toast';
import { TopBar } from '@/src/components/TopBar';
import { useAuth } from '@/src/contexts/AuthContext';
import {
  api,
  type AlertItem,
  type Reading,
  type SessionRecord,
  type WoundPhoto,
} from '@/src/services/api';
import { colors, radii, spacing, typography } from '@/src/theme/tokens';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [notif, setNotif] = useState(true);
  const [sync, setSync] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(
    null,
  );

  async function exportReport() {
    if (!user) return;
    setExporting(true);
    try {
      const [photos, sessions, readings, alerts] = await Promise.all([
        api.get<WoundPhoto[]>('/wound-photos'),
        api.get<SessionRecord[]>('/sessions'),
        api.get<Reading[]>('/readings?range=30d'),
        api.get<AlertItem[]>('/alerts'),
      ]);
      const html = buildReportHtml({ user, photos, sessions, readings, alerts });
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (sharingAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Relatório T.E.R.E.S.A.',
          UTI: 'com.adobe.pdf',
        });
      }
      setToast({ msg: 'Relatório PDF gerado!', type: 'success' });
    } catch (e: any) {
      setToast({ msg: e?.detail ?? 'Falha ao gerar relatório', type: 'error' });
    } finally {
      setExporting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Configurações" showBack />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card padded title="Preferências" testID="settings-prefs">
          <Row label="Tema" value="Claro (padrão)" icon="color-palette-outline" />
          <Row label="Idioma" value="Português (Brasil)" icon="language-outline" />
          <Row label="Notificações" icon="notifications-outline">
            <Switch value={notif} onValueChange={setNotif} testID="switch-notif" />
          </Row>
          <Row label="Sincronização automática" icon="cloud-outline" last>
            <Switch value={sync} onValueChange={setSync} testID="switch-sync" />
          </Row>
        </Card>

        <Card padded title="Dispositivo" testID="settings-device">
          <NavRow
            icon="bluetooth"
            label="Bluetooth"
            hint="Gerenciar conexão com T.E.R.E.S.A."
            onPress={() => router.push('/(app)/connect')}
          />
          <NavRow
            icon="shield-checkmark-outline"
            label="Permissões"
            hint="Câmera, Bluetooth, notificações"
            onPress={() => {}}
            last
          />
        </Card>

        <Card padded title="Dados" testID="settings-data">
          <NavRow
            icon="download-outline"
            label={exporting ? 'Gerando PDF…' : 'Exportar relatório'}
            hint="Baixar histórico completo em PDF"
            onPress={exportReport}
          />
          <NavRow
            icon="save-outline"
            label="Backup"
            hint="Cópia de segurança na nuvem"
            onPress={() => setToast({ msg: 'Backup já é feito no banco de dados', type: 'info' })}
            last
          />
        </Card>

        <Card padded title="Sobre" testID="settings-about">
          <NavRow
            icon="information-circle-outline"
            label="Sobre o projeto"
            onPress={() => router.push('/(app)/about')}
          />
          <NavRow
            icon="help-circle-outline"
            label="Ajuda"
            onPress={() => router.push('/(app)/help')}
          />
          <NavRow
            icon="shield-outline"
            label="Política de privacidade"
            onPress={() => router.push('/(app)/privacy')}
          />
          <NavRow
            icon="refresh-outline"
            label="Verificar atualizações"
            onPress={() => {}}
            last
          />
        </Card>

        <Card padded testID="settings-version">
          <View style={styles.versionRow}>
            <Text style={styles.versionLabel}>Versão do aplicativo</Text>
            <Text style={styles.versionValue}>
              {Constants.expoConfig?.version ?? '1.0.0'}
            </Text>
          </View>
        </Card>

        <Pressable
          style={styles.logoutBtn}
          onPress={async () => {
            await logout();
            // No login screen — splash will auto-login as Dra. Ana.
            router.replace('/');
          }}
          testID="settings-logout"
        >
          <Ionicons name="refresh-outline" size={20} color={colors.redAlert} />
          <Text style={styles.logoutText}>Reiniciar sessão</Text>
        </Pressable>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
      {toast && (
        <Toast visible message={toast.msg} type={toast.type} onHide={() => setToast(null)} />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------
// PDF builder — produces a lightweight A4 clinical report in HTML.
// ---------------------------------------------------------------------
function buildReportHtml(args: {
  user: { name: string; email: string; role: string };
  photos: WoundPhoto[];
  sessions: SessionRecord[];
  readings: Reading[];
  alerts: AlertItem[];
}): string {
  const { user, photos, sessions, readings, alerts } = args;
  const latestPhoto = photos[0];
  const avgTemp =
    readings.length > 0
      ? (readings.reduce((s, r) => s + r.temperature_c, 0) / readings.length).toFixed(1)
      : '—';
  const avgHum =
    readings.length > 0
      ? (readings.reduce((s, r) => s + r.humidity_pct, 0) / readings.length).toFixed(0)
      : '—';
  const photosHtml = photos
    .slice(0, 12)
    .map((p) => {
      const a = p.analysis;
      const date = new Date(p.timestamp).toLocaleString('pt-BR');
      return `
        <div class="photo">
          <img src="data:image/jpeg;base64,${p.image_base64}" />
          <div class="pmeta">
            <div class="pdate">${date}</div>
            ${
              a
                ? `<div class="pstats">Cicatrização: <b>${a.healing_percentage}%</b> · Área ${a.estimated_area_cm2.toFixed(
                    1,
                  )} cm²</div>`
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0A1930; padding: 24px; }
          h1 { color: #0D47A1; margin: 0 0 4px; }
          .sub { color: #64748B; margin-bottom: 20px; }
          .block { background: #F8FBFF; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
          .block h2 { margin: 0 0 12px; color: #2D6CDF; font-size: 15px; }
          .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #E2E8F0; }
          .row:last-child { border-bottom: 0; }
          .photo { display: inline-block; width: 32%; margin: 1% 0.5%; vertical-align: top; }
          .photo img { width: 100%; height: 150px; object-fit: cover; border-radius: 8px; }
          .pmeta { font-size: 11px; margin-top: 4px; color: #475569; }
          .pdate { font-weight: 600; }
          .footer { margin-top: 24px; font-size: 10px; color: #94A3B8; text-align: center; }
        </style>
      </head>
      <body>
        <h1>Relatório T.E.R.E.S.A.</h1>
        <div class="sub">
          ${user.name} · ${user.email} · ${user.role}<br/>
          Emitido em ${new Date().toLocaleString('pt-BR')}
        </div>

        <div class="block">
          <h2>Resumo</h2>
          <div class="row"><span>Fotos registradas</span><b>${photos.length}</b></div>
          <div class="row"><span>Sessões realizadas</span><b>${sessions.length}</b></div>
          <div class="row"><span>Temperatura média (30 d)</span><b>${avgTemp} °C</b></div>
          <div class="row"><span>Umidade média (30 d)</span><b>${avgHum} %</b></div>
          <div class="row"><span>Última cicatrização</span><b>${
            latestPhoto?.analysis?.healing_percentage ?? '—'
          }%</b></div>
          <div class="row"><span>Alertas no período</span><b>${alerts.length}</b></div>
        </div>

        <div class="block">
          <h2>Fotos recentes</h2>
          ${photosHtml || '<em>Sem fotos registradas.</em>'}
        </div>

        <div class="footer">
          T.E.R.E.S.A. — Tecnologia Especializada em Recuperação e Estímulo à Saúde Avançada<br/>
          Documento gerado automaticamente. Esta análise não constitui diagnóstico médico.
        </div>
      </body>
    </html>
  `;
}

function Row({
  label,
  value,
  icon,
  children,
  last,
}: {
  label: string;
  value?: string;
  icon: keyof typeof Ionicons.glyphMap;
  children?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function NavRow({
  label,
  icon,
  hint,
  onPress,
  last,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  hint?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.row, last && styles.rowLast]}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    padding: spacing.container,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  rowValue: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  rowHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  versionLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  versionValue: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  logoutBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    backgroundColor: '#FEF2F2',
  },
  logoutText: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.redAlert,
  },
});
