import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { labelForState, type TreatmentState } from '@/src/services/ble';
import { colors, radii, spacing, typography } from '@/src/theme/tokens';

interface Props {
  state: TreatmentState | null;
  connected: boolean;
  testID?: string;
}

const COLORS: Record<TreatmentState, { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  AGUARDANDO_BRACELETE: { color: '#6B7280', bg: '#F3F4F6', icon: 'hourglass-outline' },
  AGUARDANDO_INICIO:    { color: '#0EA5E9', bg: '#E0F2FE', icon: 'play-circle-outline' },
  AQUECENDO:            { color: '#F59E0B', bg: '#FEF3C7', icon: 'flame-outline' },
  EM_TRATAMENTO:        { color: '#10B981', bg: '#D1FAE5', icon: 'pulse-outline' },
  TRATAMENTO_INTERROMPIDO: { color: '#EF4444', bg: '#FEE2E2', icon: 'warning-outline' },
  TRATAMENTO_FINALIZADO:   { color: '#2D6CDF', bg: '#DBEAFE', icon: 'checkmark-circle-outline' },
  DESCONHECIDO:         { color: '#6B7280', bg: '#F3F4F6', icon: 'help-outline' },
};

export function StateBadge({ state, connected, testID }: Props) {
  if (!connected || !state) {
    return (
      <View style={[styles.wrap, { backgroundColor: '#F3F4F6' }]} testID={testID}>
        <Ionicons name="ellipse-outline" size={14} color={colors.textDisabled} />
        <Text style={[styles.text, { color: colors.textDisabled }]}>
          Equipamento desconectado
        </Text>
      </View>
    );
  }
  const map = COLORS[state] ?? COLORS.DESCONHECIDO;
  return (
    <View style={[styles.wrap, { backgroundColor: map.bg }]} testID={testID}>
      <Ionicons name={map.icon} size={14} color={map.color} />
      <Text style={[styles.text, { color: map.color }]}>{labelForState(state)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  text: {
    ...typography.caption,
    fontWeight: '700',
  },
});
