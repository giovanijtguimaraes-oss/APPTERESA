import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/src/contexts/AuthContext';
import { colors, radii, spacing, typography } from '@/src/theme/tokens';

export default function AppLayout() {
  const { user, loading, impersonation, endImpersonation } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      // No session — bounce back to the splash which will auto-login
      // again (there is no standalone /login screen anymore).
      router.replace('/');
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  async function handleEndImpersonation() {
    try {
      await endImpersonation();
      router.replace('/(app)/(tabs)/home');
    } catch {
      // silent — context handles the fallback
    }
  }

  return (
    <View style={styles.wrap}>
      {impersonation.active && (
        <SafeAreaView edges={['top']} style={styles.bannerSafe}>
          <View style={styles.banner} testID="impersonation-banner">
            <View style={styles.bannerIcon}>
              <Ionicons name="eye" size={16} color={colors.surface} />
            </View>
            <View style={styles.bannerText}>
              <Text style={styles.bannerLine1}>Visualizando como paciente</Text>
              <Text style={styles.bannerLine2} numberOfLines={1}>
                {user.name}  ·  retornar a {impersonation.previousUser?.name ?? 'médico(a)'}
              </Text>
            </View>
            <Pressable
              onPress={handleEndImpersonation}
              style={styles.bannerBtn}
              hitSlop={10}
              testID="impersonation-exit"
            >
              <Ionicons name="arrow-undo" size={14} color={colors.primaryDark} />
              <Text style={styles.bannerBtnText}>Sair</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      )}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerSafe: { backgroundColor: '#FEF3C7' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: '#FEF3C7',
    borderBottomWidth: 1,
    borderBottomColor: '#F59E0B',
  },
  bannerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: { flex: 1 },
  bannerLine1: {
    ...typography.caption,
    color: '#92400E',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontSize: 10,
  },
  bannerLine2: {
    ...typography.caption,
    color: '#92400E',
    fontWeight: '600',
  },
  bannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  bannerBtnText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '700',
  },
});
