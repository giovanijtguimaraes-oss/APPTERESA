import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, shadows, spacing, typography } from '@/src/theme/tokens';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  testID?: string;
  fullWidth?: boolean;
}

export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  testID,
  fullWidth = true,
}: Props) {
  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';
  const isOutline = variant === 'outline';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        isPrimary && styles.primary,
        isSecondary && styles.secondary,
        isOutline && styles.outline,
        fullWidth && styles.full,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
      <Text
        style={[
          styles.label,
          isPrimary && styles.labelPrimary,
          isSecondary && styles.labelSecondary,
          isOutline && styles.labelOutline,
        ]}
      >
        {loading ? 'Aguarde…' : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.pill,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  full: {
    alignSelf: 'stretch',
  },
  primary: {
    backgroundColor: colors.primary,
    ...shadows.floating,
  },
  secondary: {
    backgroundColor: colors.primarySoft,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  iconWrap: {
    marginRight: 2,
  },
  label: {
    ...typography.bodyLarge,
    fontWeight: '600',
  },
  labelPrimary: {
    color: colors.textInverse,
  },
  labelSecondary: {
    color: colors.primaryDark,
  },
  labelOutline: {
    color: colors.primary,
  },
});
