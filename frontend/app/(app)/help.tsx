import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/src/components/Card';
import { TopBar } from '@/src/components/TopBar';
import { colors, spacing, typography } from '@/src/theme/tokens';

const FAQ = [
  {
    q: 'Como conecto o equipamento T.E.R.E.S.A.?',
    a: 'Acesse o menu (☰) → "Conectar equipamento" e siga o passo a passo. Certifique-se de que o Bluetooth do iPhone está ativo.',
  },
  {
    q: 'Como faço uma análise da ferida?',
    a: 'Na tela Home, toque no botão redondo com a câmera. Autorize o acesso à câmera e capture a foto da lesão.',
  },
  {
    q: 'A análise de IA é confiável?',
    a: 'A análise é feita por modelos de IA vision (GPT-5.2 / Claude Sonnet 4.5) e serve como apoio clínico. Consulte sempre um profissional para decisões de tratamento.',
  },
  {
    q: 'O que fazer se a temperatura estiver elevada?',
    a: 'Um alerta será exibido automaticamente. Interrompa a sessão e entre em contato com um profissional de saúde.',
  },
  {
    q: 'Como visualizo o histórico de tratamento?',
    a: 'Acesse a aba "Calendário" para ver o resumo diário, ou vá em "Perfil" para o histórico completo.',
  },
];

export default function HelpScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Ajuda" showBack />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card padded testID="help-intro">
          <View style={styles.introRow}>
            <View style={styles.introIcon}>
              <Ionicons name="help-circle" size={28} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.h}>Precisa de ajuda?</Text>
              <Text style={styles.sub}>
                Encontre respostas para as dúvidas mais frequentes ou fale conosco.
              </Text>
            </View>
          </View>
        </Card>

        <Card padded title="Perguntas frequentes" testID="help-faq">
          {FAQ.map((item, i) => (
            <View
              key={i}
              style={[styles.faqItem, i === FAQ.length - 1 && styles.faqItemLast]}
            >
              <Text style={styles.q}>{item.q}</Text>
              <Text style={styles.a}>{item.a}</Text>
            </View>
          ))}
        </Card>

        <Card padded title="Fale conosco" testID="help-contact">
          <ContactRow icon="mail-outline" label="suporte@teresa.med.br" />
          <ContactRow icon="call-outline" label="0800 123 4567" last />
        </Card>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ContactRow({
  icon,
  label,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.contactRow, last && styles.contactRowLast]}>
      <View style={styles.contactIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={styles.contactLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    padding: spacing.container,
    gap: spacing.md,
  },
  introRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  introIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  h: {
    ...typography.h4,
    color: colors.textPrimary,
  },
  sub: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  faqItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  faqItemLast: {
    borderBottomWidth: 0,
  },
  q: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  a: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  contactRowLast: {
    borderBottomWidth: 0,
  },
  contactIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactLabel: {
    ...typography.bodyLarge,
    color: colors.textPrimary,
    fontWeight: '600',
  },
});
