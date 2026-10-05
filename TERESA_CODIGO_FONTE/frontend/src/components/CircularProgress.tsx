import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, typography } from '@/src/theme/tokens';

interface Props {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
  testID?: string;
}

export function CircularProgress({
  percentage,
  size = 100,
  strokeWidth = 10,
  label,
  color = colors.primary,
  trackColor = colors.primarySoft,
  children,
  testID,
}: Props) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clamped / 100) * circumference;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} testID={testID}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </Svg>
      {children ? (
        children
      ) : (
        <View style={styles.centerText}>
          <Text style={styles.pct}>{clamped}%</Text>
          {label && <Text style={styles.label}>{label}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centerText: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pct: {
    ...typography.h3,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
