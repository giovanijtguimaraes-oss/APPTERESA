import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/src/components/Card';
import { LineChart } from '@/src/components/LineChart';
import { TopBar } from '@/src/components/TopBar';
import {
  api,
  type DaySummary,
  type MonthDayStatus,
} from '@/src/services/api';
import { colors, radii, spacing, typography } from '@/src/theme/tokens';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function toISODate(y: number, m: number, d: number): string {
  const mm = String(m + 1).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

export default function CalendarScreen() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(
    toISODate(today.getFullYear(), today.getMonth(), today.getDate()),
  );
  const [monthData, setMonthData] = useState<Record<string, MonthDayStatus>>({});
  const [day, setDay] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMonth = useCallback(async () => {
    try {
      const res = await api.get<{ days: Record<string, MonthDayStatus> }>(
        `/calendar/month/${viewYear}/${viewMonth + 1}`,
      );
      setMonthData(res.days);
    } catch {
      setMonthData({});
    }
  }, [viewYear, viewMonth]);

  const loadDay = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<DaySummary>(`/calendar/day/${selectedDate}`);
      setDay(res);
    } catch {
      setDay(null);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  function shiftMonth(delta: number) {
    let y = viewYear;
    let m = viewMonth + delta;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewYear(y);
    setViewMonth(m);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card padded testID="calendar-card">
          <View style={styles.monthHeader}>
            <Pressable
              onPress={() => shiftMonth(-1)}
              hitSlop={10}
              testID="calendar-prev"
            >
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.monthTitle} testID="calendar-month-title">
              {MONTHS[viewMonth]} {viewYear}
            </Text>
            <Pressable
              onPress={() => shiftMonth(1)}
              hitSlop={10}
              testID="calendar-next"
            >
              <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w) => (
              <Text key={w} style={styles.weekDay}>
                {w}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {grid.map((cell, idx) => {
              if (!cell) {
                return <View key={idx} style={styles.cell} />;
              }
              const iso = toISODate(viewYear, viewMonth, cell);
              const status = monthData[iso];
              const isSelected = iso === selectedDate;
              const isToday =
                cell === today.getDate() &&
                viewMonth === today.getMonth() &&
                viewYear === today.getFullYear();

              return (
                <Pressable
                  key={idx}
                  onPress={() => setSelectedDate(iso)}
                  style={[
                    styles.cell,
                    isSelected && styles.cellSelected,
                    isToday && !isSelected && styles.cellToday,
                  ]}
                  testID={`day-${iso}`}
                >
                  <Text
                    style={[
                      styles.cellText,
                      isSelected && styles.cellTextSelected,
                    ]}
                  >
                    {cell}
                  </Text>
                  {status && <DayMarkers status={status} selected={isSelected} />}
                </Pressable>
              );
            })}
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <LegendItem color={colors.blueDone} label="Sessão" />
            <LegendItem color={colors.greenGood} label="Boa evolução" />
            <LegendItem color={colors.yellowObserve} label="Observação" />
            <LegendItem color={colors.redAlert} label="Alerta" />
          </View>
        </Card>

        {/* Day detail */}
        <Card padded title={formatSelectedDate(selectedDate)} testID="day-detail-card">
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.lg }} />
          ) : day && (day.readings.length > 0 || day.session_count > 0 || day.photo_count > 0) ? (
            <View style={{ gap: spacing.md }}>
              <View style={styles.summaryRow}>
                <SummaryPill
                  icon="thermometer-outline"
                  label="Temperatura"
                  value={
                    day.avg_temperature_c !== null
                      ? `${day.avg_temperature_c.toFixed(1)}°C`
                      : '—'
                  }
                />
                <SummaryPill
                  icon="water-outline"
                  label="Umidade"
                  value={
                    day.avg_humidity_pct !== null
                      ? `${day.avg_humidity_pct.toFixed(0)}%`
                      : '—'
                  }
                />
              </View>
              <View style={styles.summaryRow}>
                <SummaryPill
                  icon="time-outline"
                  label="Sessões"
                  value={`${day.session_count} (${day.session_duration_min} min)`}
                />
                <SummaryPill
                  icon="images-outline"
                  label="Fotos"
                  value={String(day.photo_count)}
                />
              </View>
              {day.readings.length > 0 && (
                <View>
                  <Text style={styles.chartLabel}>Temperatura no dia</Text>
                  <LineChart
                    data={day.readings.map((r, i) => ({ x: i, y: r.temperature_c }))}
                    height={140}
                    yUnit="°"
                  />
                </View>
              )}
              {day.photos.length > 0 && (
                <View>
                  <Text style={styles.chartLabel}>Fotos registradas</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.photoRow}>
                      {day.photos.map((p) => (
                        <Image
                          key={p.id}
                          source={{ uri: `data:image/jpeg;base64,${p.image_base64}` }}
                          style={styles.dayPhoto}
                        />
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptyDay}>
              <Ionicons name="calendar-outline" size={28} color={colors.textDisabled} />
              <Text style={styles.emptyDayText}>Sem registros neste dia</Text>
            </View>
          )}
        </Card>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function DayMarkers({ status, selected }: { status: MonthDayStatus; selected: boolean }) {
  const dots: string[] = [];
  if (status.session) dots.push(colors.blueDone);
  if (status.good) dots.push(colors.greenGood);
  if (status.warning) dots.push(colors.yellowObserve);
  if (status.alert) dots.push(colors.redAlert);

  return (
    <View style={styles.dotsRow} pointerEvents="none">
      {dots.slice(0, 4).map((c, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: selected ? colors.surface : c },
          ]}
        />
      ))}
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function SummaryPill({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.pill}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.pillLabel}>{label}</Text>
        <Text style={styles.pillValue}>{value}</Text>
      </View>
    </View>
  );
}

function buildMonthGrid(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatSelectedDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    padding: spacing.container,
    gap: spacing.md,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  monthTitle: {
    ...typography.h4,
    color: colors.textPrimary,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  cellSelected: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
  },
  cellToday: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
  },
  cellText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  cellTextSelected: {
    color: colors.surface,
    fontWeight: '700',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radii.md,
  },
  pillLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  pillValue: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  chartLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  photoRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dayPhoto: {
    width: 90,
    height: 90,
    borderRadius: radii.md,
  },
  emptyDay: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  emptyDayText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
