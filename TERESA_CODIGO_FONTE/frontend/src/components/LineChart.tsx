import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { colors, typography } from '@/src/theme/tokens';

interface Props {
  data: { x: string | number; y: number }[];
  height?: number;
  showAxis?: boolean;
  yUnit?: string;
  color?: string;
}

/**
 * Minimal smooth line chart. Uses cubic Bézier through midpoints for a smooth
 * curve without a heavy dependency. Empty data shows a subtle placeholder.
 */
export function LineChart({
  data,
  height = 180,
  showAxis = true,
  yUnit = '',
  color = colors.primary,
}: Props) {
  const w = 320;
  const paddingLeft = 34;
  const paddingRight = 12;
  const paddingTop = 12;
  const paddingBottom = 24;
  const chartW = w - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  if (!data.length) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>Sem dados no período</Text>
      </View>
    );
  }

  const ys = data.map((d) => d.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeY = maxY - minY || 1;
  const paddedMin = minY - rangeY * 0.15;
  const paddedMax = maxY + rangeY * 0.15;
  const paddedRange = paddedMax - paddedMin || 1;

  const stepX = data.length > 1 ? chartW / (data.length - 1) : chartW;

  const points = data.map((d, i) => ({
    x: paddingLeft + i * stepX,
    y: paddingTop + chartH - ((d.y - paddedMin) / paddedRange) * chartH,
  }));

  // Smooth path (cubic bezier)
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const cp1x = prev.x + (cur.x - prev.x) / 2;
    const cp1y = prev.y;
    const cp2x = prev.x + (cur.x - prev.x) / 2;
    const cp2y = cur.y;
    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${cur.x} ${cur.y}`;
  }

  const areaPath = `${path} L ${points[points.length - 1].x} ${
    paddingTop + chartH
  } L ${points[0].x} ${paddingTop + chartH} Z`;

  const midY = paddedMin + paddedRange / 2;

  return (
    <View>
      <Svg width={w} height={height}>
        <Defs>
          <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.28" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {showAxis && (
          <>
            {[0, 0.5, 1].map((f, i) => {
              const y = paddingTop + chartH * f;
              return (
                <Path
                  key={i}
                  d={`M ${paddingLeft} ${y} L ${w - paddingRight} ${y}`}
                  stroke={colors.borderLight}
                  strokeWidth={1}
                  strokeDasharray="4,4"
                />
              );
            })}
          </>
        )}

        <Path d={areaPath} fill="url(#grad)" />
        <Path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
        ))}
      </Svg>
      {showAxis && (
        <View style={styles.yLabels} pointerEvents="none">
          <Text style={styles.axis}>
            {paddedMax.toFixed(1)}
            {yUnit}
          </Text>
          <Text style={styles.axis}>
            {midY.toFixed(1)}
            {yUnit}
          </Text>
          <Text style={styles.axis}>
            {paddedMin.toFixed(1)}
            {yUnit}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  yLabels: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 22,
    justifyContent: 'space-between',
    width: 34,
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  axis: {
    ...typography.caption,
    color: colors.textDisabled,
    fontSize: 10,
  },
});
