import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/src/contexts/AuthContext';
import { colors, radii, shadows, spacing, typography } from '@/src/theme/tokens';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const ITEMS: {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}[] = [
  { key: 'settings', label: 'Configurações', icon: 'settings-outline', route: '/(app)/settings' },
  { key: 'connect', label: 'Conectar equipamento', icon: 'bluetooth', route: '/(app)/connect' },
  { key: 'about', label: 'Sobre o projeto', icon: 'information-circle-outline', route: '/(app)/about' },
  { key: 'help', label: 'Ajuda', icon: 'help-circle-outline', route: '/(app)/help' },
  { key: 'privacy', label: 'Política de privacidade', icon: 'shield-checkmark-outline', route: '/(app)/privacy' },
];

export function AppDrawer({ visible, onClose }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  function go(route: string) {
    onClose();
    // slight delay so drawer visually closes first
    setTimeout(() => router.push(route as any), 150);
  }

  async function handleLogout() {
    onClose();
    await logout();
    router.replace('/login');
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        testID="drawer-backdrop"
      >
        <Pressable
          style={[styles.panel, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <View style={styles.logoRow}>
              <View style={styles.logoIcon}>
                <Ionicons name="medical" size={22} color={colors.surface} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.brand}>T.E.R.E.S.A.</Text>
                <Text style={styles.tag}>Cicatrização Inteligente</Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                testID="drawer-close"
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </Pressable>
            </View>

            {user && (
              <View style={styles.userCard} testID="drawer-user-card">
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {user.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName} numberOfLines={1}>
                    {user.name}
                  </Text>
                  <Text style={styles.userEmail} numberOfLines={1}>
                    {user.email}
                  </Text>
                </View>
              </View>
            )}
          </View>

          <ScrollView
            contentContainerStyle={styles.menuScroll}
            showsVerticalScrollIndicator={false}
          >
            {ITEMS.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => go(item.route)}
                style={({ pressed }) => [
                  styles.menuItem,
                  pressed && styles.menuItemPressed,
                ]}
                testID={`drawer-item-${item.key}`}
              >
                <View style={styles.menuIconWrap}>
                  <Ionicons name={item.icon} size={22} color={colors.primary} />
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />
              </Pressable>
            ))}
          </ScrollView>

          <Pressable
            onPress={handleLogout}
            style={styles.logoutBtn}
            testID="drawer-logout"
          >
            <Ionicons name="log-out-outline" size={20} color={colors.redAlert} />
            <Text style={styles.logoutText}>Sair</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    flexDirection: 'row',
  },
  panel: {
    width: '82%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderTopRightRadius: radii.card,
    borderBottomRightRadius: radii.card,
    ...shadows.medium,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    ...typography.h4,
    color: colors.primaryDark,
  },
  tag: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  userCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.textInverse,
    ...typography.h4,
  },
  userName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  userEmail: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  menuScroll: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  menuItemPressed: {
    backgroundColor: colors.primarySoft,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    flex: 1,
    ...typography.bodyLarge,
    color: colors.textPrimary,
  },
  logoutBtn: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
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
