import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, typography } from '@/src/theme/tokens';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textDisabled,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: [
          styles.tabBar,
          {
            height: 60 + insets.bottom,
            paddingBottom: insets.bottom > 0 ? insets.bottom : 6,
            paddingTop: 6,
          },
        ],
        tabBarIcon: ({ color, focused }) => {
          const map: Record<string, keyof typeof Ionicons.glyphMap> = {
            home: focused ? 'home' : 'home-outline',
            calendar: focused ? 'calendar' : 'calendar-outline',
            notices: focused ? 'notifications' : 'notifications-outline',
            profile: focused ? 'person' : 'person-outline',
          };
          const name = map[route.name] ?? 'ellipse-outline';
          return <Ionicons name={name} size={22} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarTestID: 'tab-home' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendário', tabBarTestID: 'tab-calendar' }} />
      <Tabs.Screen name="notices" options={{ title: 'Avisos', tabBarTestID: 'tab-notices' }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarTestID: 'tab-profile' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  tabLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
});
