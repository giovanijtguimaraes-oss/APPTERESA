import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/src/components/Card';
import { TopBar } from '@/src/components/TopBar';
import { colors, shadows, spacing, typography } from '@/src/theme/tokens';

export default function AboutScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Sobre o projeto" showBack />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.logoWrap}>
          <View style={styles.logoIcon}>
            <Ionicons name="medical" size={40} color={colors.surface} />
          </View>
          <Text style={styles.brand}>T.E.R.E.S.A.</Text>
          <Text style={styles.tagline}>
            Tecnologia Especializada em Recuperação e Estímulo à Saúde Avançada
          </Text>
        </View>

        <Card padded testID="about-mission">
          <Text style={styles.h}>Missão</Text>
          <Text style={styles.p}>
            Oferecer cuidado biomédico avançado por meio de fotobiomodulação
            inteligente, unindo tecnologia de ponta, humanidade e ciência para
            acelerar processos de cicatrização e recuperação.
          </Text>
        </Card>

        <Card padded testID="about-tech">
          <Text style={styles.h}>Como funciona</Text>
          <Text style={styles.p}>
            O equipamento T.E.R.E.S.A. combina LEDs, radiação infravermelha e
            monitoramento ambiental em tempo real através de um microcontrolador
            ESP32. O aplicativo se comunica via Bluetooth Low Energy (BLE) para
            controle de protocolos, telemetria e análise clínica.
          </Text>
        </Card>

        <Card padded testID="about-inspiration">
          <Text style={styles.h}>Inspiração</Text>
          <Text style={styles.p}>
            A identidade visual — em branco e tons de azul — homenageia as
            vestes de Madre Teresa de Calcutá, símbolo de cuidado, dedicação e
            esperança. Cada detalhe do design foi pensado para transmitir
            confiança e serenidade ao paciente.
          </Text>
        </Card>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    padding: spacing.container,
    gap: spacing.md,
  },
  logoWrap: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  logoIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.floating,
  },
  brand: {
    ...typography.h2,
    color: colors.primaryDark,
    letterSpacing: 2,
  },
  tagline: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
  h: {
    ...typography.h4,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  p: {
    ...typography.bodyLarge,
    color: colors.textSecondary,
    lineHeight: 24,
  },
});
