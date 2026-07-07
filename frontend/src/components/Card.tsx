import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, radii, shadows, spacing, typography } from '@/src/theme/tokens';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  title?: string;
  action?: React.ReactNode;
  testID?: string;
}

export function Card({
  children,
  style,
  padded = true,
  title,
  action,
  testID,
}: Props) {
  return (
    <View
      style={[styles.card, padded && styles.padded, style]}
      testID={testID}
    >
      {(title || action) && (
        <View style={styles.header}>
          {title ? <Text style={styles.title}>{title}</Text> : <View />}
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    ...shadows.soft,
  },
  padded: {
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h4,
    color: colors.textPrimary,
  },
});
