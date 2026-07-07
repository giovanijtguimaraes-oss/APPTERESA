import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppDrawer } from '@/src/components/AppDrawer';
import { api } from '@/src/services/api';
import { colors, spacing, typography } from '@/src/theme/tokens';

interface Props {
  onBellPress?: () => void;
  showBack?: boolean;
  title?: string;
}

export function TopBar({ onBellPress, showBack = false, title }: Props) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  async function refreshUnread() {
    try {
      const r = await api.get<{ count: number }>('/alerts/unread-count');
      setUnread(r.count);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    refreshUnread();
    const t = setInterval(refreshUnread, 15000);
    return () => clearInterval(t);
  }, []);

  function handleBell() {
    if (onBellPress) onBellPress();
    else router.push('/(app)/(tabs)/notices');
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <Pressable
          onPress={() => (showBack ? router.back() : setDrawerOpen(true))}
          hitSlop={12}
          style={styles.iconBtn}
          testID={showBack ? 'topbar-back' : 'topbar-menu'}
        >
          <Ionicons
            name={showBack ? 'chevron-back' : 'menu'}
            size={26}
            color={colors.textPrimary}
          />
        </Pressable>

        <View style={styles.centerWrap} pointerEvents="none">
          {title ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : (
            <Text style={styles.brand}>T.E.R.E.S.A.</Text>
          )}
        </View>

        <Pressable
          onPress={handleBell}
          hitSlop={12}
          style={styles.iconBtn}
          testID="topbar-bell"
        >
          <Ionicons name="notifications-outline" size={24} color={colors.textPrimary} />
          {unread > 0 && (
            <View style={styles.badge} testID="topbar-bell-badge">
              <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          )}
        </Pressable>
      </View>
      <AppDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  bar: {
    height: 52,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
  },
  brand: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.primaryDark,
    letterSpacing: 1.2,
  },
  title: {
    ...typography.h4,
    color: colors.textPrimary,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.redAlert,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: '700',
  },
});
