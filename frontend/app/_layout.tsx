import { Stack } from 'expo-router';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { LogBox } from 'react-native';

import { AuthProvider } from '@/src/contexts/AuthContext';
import { useIconFonts } from '@/src/hooks/use-icon-fonts';

LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#F8FBFF' },
            }}
          />
        </AuthProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
