import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/src/theme/tokens';

interface Props<T extends string> {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  testIDPrefix?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  testIDPrefix = 'segment',
}: Props<T>) {
  return (
    <View style={styles.wrap}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.segment, active && styles.segmentActive]}
            testID={`${testIDPrefix}-${opt.value}`}
          >
            <Text style={[styles.text, active && styles.textActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    padding: 3,
    gap: 2,
  },
  segment: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  segmentActive: {
    backgroundColor: colors.surface,
  },
  text: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  textActive: {
    color: colors.primaryDark,
  },
});
