import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/src/components/EmptyState';
import { TopBar } from '@/src/components/TopBar';
import { api, type AlertItem } from '@/src/services/api';
import { colors, radii, shadows, spacing, typography } from '@/src/theme/tokens';

const LEVEL_MAP = {
  info: { icon: 'information-circle', color: colors.primary, bg: colors.primarySoft, badge: 'Info' },
  warning: { icon: 'warning', color: colors.yellowObserve, bg: '#FEF3C7', badge: 'Atenção' },
  critical: { icon: 'alert-circle', color: colors.redAlert, bg: '#FEE2E2', badge: 'Crítico' },
  success: { icon: 'checkmark-circle', color: colors.greenGood, bg: '#D1FAE5', badge: 'OK' },
} as const;

const CATEGORY_MAP: Record<string, string> = {
  system: 'Sistema',
  device: 'Equipamento',
  medical: 'Médico',
  environmental: 'Ambiente',
  update: 'Atualização',
  protocol: 'Protocolo',
};

export default function NoticesScreen() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.get<AlertItem[]>('/alerts');
      setAlerts(list);
    } catch {
      setAlerts([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  async function markAllRead() {
    await api.post('/alerts/read-all');
    await load();
  }

  async function markRead(id: string) {
    await api.post(`/alerts/${id}/read`);
    await load();
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const unread = alerts.filter((a) => !a.read).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar />

      <View style={styles.headerRow}>
        <View>
          <Text style={styles.headerTitle}>Avisos</Text>
          <Text style={styles.headerSub}>
            {unread > 0
              ? `${unread} não ${unread === 1 ? 'lido' : 'lidos'}`
              : 'Tudo em dia'}
          </Text>
        </View>
        {unread > 0 && (
          <Pressable
            onPress={markAllRead}
            style={styles.markAllBtn}
            testID="mark-all-read"
          >
            <Ionicons name="checkmark-done" size={16} color={colors.primary} />
            <Text style={styles.markAllText}>Marcar tudo</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {alerts.length === 0 && !loading ? (
          <EmptyState
            icon="notifications-off-outline"
            title="Sem avisos por enquanto"
            description="Quando o equipamento gerar novos alertas eles aparecerão aqui em tempo real."
            testID="notices-empty"
          />
        ) : (
          alerts.map((a) => <NoticeCard key={a.id} alert={a} onPress={() => markRead(a.id)} />)
        )}
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function NoticeCard({ alert, onPress }: { alert: AlertItem; onPress: () => void }) {
  const map = LEVEL_MAP[alert.level];
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, !alert.read && styles.cardUnread]}
      testID={`notice-${alert.id}`}
    >
      <View style={[styles.iconWrap, { backgroundColor: map.bg }]}>
        <Ionicons name={map.icon as any} size={22} color={map.color} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {alert.title}
          </Text>
          <View style={[styles.badge, { backgroundColor: map.bg }]}>
            <Text style={[styles.badgeText, { color: map.color }]}>{map.badge}</Text>
          </View>
        </View>
        <Text style={styles.desc} numberOfLines={3}>
          {alert.description}
        </Text>
        <View style={styles.footerRow}>
          <Text style={styles.category}>
            {CATEGORY_MAP[alert.category] ?? alert.category}
          </Text>
          <Text style={styles.time}>{formatTimestamp(alert.timestamp)}</Text>
        </View>
      </View>
      {!alert.read && <View style={styles.unreadDot} />}
    </Pressable>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.container,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  headerSub: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
  },
  markAllText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  scroll: {
    padding: spacing.container,
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    ...shadows.soft,
    position: 'relative',
  },
  cardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  badgeText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '700',
  },
  desc: {
    ...typography.body,
    color: colors.textSecondary,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  category: {
    ...typography.caption,
    color: colors.textDisabled,
    fontWeight: '600',
  },
  time: {
    ...typography.caption,
    color: colors.textDisabled,
  },
  unreadDot: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
});
