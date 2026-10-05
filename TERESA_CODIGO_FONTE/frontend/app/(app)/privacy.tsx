import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/src/components/Card';
import { TopBar } from '@/src/components/TopBar';
import { colors, spacing, typography } from '@/src/theme/tokens';

export default function PrivacyScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Política de privacidade" showBack />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card padded testID="privacy-content">
          <Text style={styles.h}>1. Dados coletados</Text>
          <Text style={styles.p}>
            Coletamos apenas os dados essenciais para o funcionamento do
            aplicativo: nome, e-mail, senha (criptografada) e dados clínicos
            fornecidos por você (idade, sexo, tipo de lesão, medicamentos etc.).
          </Text>

          <Text style={styles.h}>2. Fotos da ferida</Text>
          <Text style={styles.p}>
            As fotos capturadas para análise permanecem associadas apenas à sua
            conta e são utilizadas exclusivamente para acompanhamento clínico e
            análise por IA. Elas nunca são compartilhadas com terceiros.
          </Text>

          <Text style={styles.h}>3. Comunicação BLE</Text>
          <Text style={styles.p}>
            A comunicação com o equipamento T.E.R.E.S.A. é feita via Bluetooth
            Low Energy (BLE) criptografado, garantindo que apenas o dispositivo
            pareado troque dados com o aplicativo.
          </Text>

          <Text style={styles.h}>4. Análise por IA</Text>
          <Text style={styles.p}>
            Ao solicitar uma análise, a imagem é enviada de forma segura para o
            provedor de IA (OpenAI/Anthropic via Emergent LLM Key). Nenhuma
            informação de identificação pessoal é anexada à requisição.
          </Text>

          <Text style={styles.h}>5. Direitos do usuário</Text>
          <Text style={styles.p}>
            Você pode a qualquer momento solicitar a exclusão da sua conta e de
            todos os seus dados. Basta entrar em contato pelo canal de suporte.
          </Text>

          <Text style={styles.h}>6. Segurança</Text>
          <Text style={styles.p}>
            Utilizamos hashing bcrypt para senhas, tokens JWT com expiração e
            armazenamento seguro (Keychain no iOS / EncryptedSharedPreferences
            no Android) para o token da sessão.
          </Text>
        </Card>

        <Text style={styles.footer}>Última atualização: Fevereiro de 2026</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    padding: spacing.container,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  h: {
    ...typography.h4,
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: 6,
  },
  p: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  footer: {
    ...typography.caption,
    color: colors.textDisabled,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
