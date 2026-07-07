import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/src/theme/tokens';

interface Props {
  message: string;
  visible: boolean;
  type?: 'success' | 'error' | 'info';
  onHide?: () => void;
}

export function Toast({ message, visible, type = 'info', onHide }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(-24)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(translate, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();

      const t = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.timing(translate, { toValue: -24, duration: 200, useNativeDriver: true }),
        ]).start(() => {
          if (onHide) onHide();
        });
      }, 2400);

      return () => clearTimeout(t);
    } else {
      opacity.setValue(0);
      translate.setValue(-24);
    }
  }, [visible, onHide, opacity, translate]);

  if (!visible) return null;

  const bg =
    type === 'success'
      ? colors.greenGood
      : type === 'error'
        ? colors.redAlert
        : colors.primaryDark;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          opacity,
          transform: [{ translateY: translate }],
          backgroundColor: bg,
        },
      ]}
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 100,
    left: spacing.md,
    right: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    zIndex: 999,
    elevation: 8,
    alignItems: 'center',
  },
  text: {
    ...typography.body,
    color: colors.textInverse,
    fontWeight: '600',
    textAlign: 'center',
  },
});
