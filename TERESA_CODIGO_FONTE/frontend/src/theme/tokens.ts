/**
 * Design tokens for T.E.R.E.S.A. — derived from /app/design_guidelines.json.
 */

export const colors = {
  primary: '#2D6CDF',
  primaryDark: '#0D47A1',
  primaryLight: '#9CC6FF',
  primarySoft: '#E6F0FF',

  bg: '#F8FBFF',
  surface: '#FFFFFF',
  overlay: 'rgba(10, 25, 48, 0.4)',

  textPrimary: '#0A1930',
  textSecondary: '#64748B',
  textDisabled: '#94A3B8',
  textInverse: '#FFFFFF',

  borderLight: '#E2E8F0',
  borderFocus: '#9CC6FF',

  // Status
  blueDone: '#2D6CDF',
  greenGood: '#10B981',
  yellowObserve: '#F59E0B',
  redAlert: '#EF4444',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  container: 20,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  card: 20,
  pill: 9999,
} as const;

export const typography = {
  h1: { fontSize: 34, fontWeight: '700', lineHeight: 41, letterSpacing: 0.4 },
  h2: { fontSize: 28, fontWeight: '700', lineHeight: 34, letterSpacing: 0.4 },
  h3: { fontSize: 22, fontWeight: '600', lineHeight: 28, letterSpacing: 0.35 },
  h4: { fontSize: 18, fontWeight: '600', lineHeight: 24, letterSpacing: 0.3 },
  bodyLarge: { fontSize: 16, fontWeight: '400', lineHeight: 24, letterSpacing: -0.2 },
  body: { fontSize: 14, fontWeight: '400', lineHeight: 20, letterSpacing: -0.1 },
  caption: { fontSize: 12, fontWeight: '500', lineHeight: 16, letterSpacing: 0 },
  metric: { fontSize: 44, fontWeight: '700', lineHeight: 52, letterSpacing: -1.0 },
} as const;

export const shadows = {
  soft: {
    shadowColor: '#0A1930',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  medium: {
    shadowColor: '#0A1930',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  floating: {
    shadowColor: '#2D6CDF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;
