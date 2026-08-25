// Central design tokens: colors, spacing, radii, and typography scale.
// Keeping every screen and component pulling from here is what makes the
// app feel like one coherent product instead of a stack of ad-hoc styles.

export const colors = {
  background: '#F5F6FA',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F1F6',
  border: '#E4E6EE',
  text: '#181A20',
  textSecondary: '#6B7080',
  textMuted: '#9AA0AE',
  primary: '#4F5BFF',
  primaryDark: '#3B45D6',
  primarySoft: '#EAEBFF',
  danger: '#E0473F',
  dangerSoft: '#FCEAE9',
  success: '#1E9E5A',
  white: '#FFFFFF',
  overlay: 'rgba(17, 19, 26, 0.45)',

  // RAG status palette — grey/blue = YTS, amber = WIP, green = DONE, red = OVERDUE.
  rag: {
    YTS: { fg: '#4C5B76', bg: '#E7ECF5', dot: '#7A8CB0' },
    WIP: { fg: '#9A6300', bg: '#FCEFD1', dot: '#E5A100' },
    DONE: { fg: '#1E9E5A', bg: '#E1F6EB', dot: '#1E9E5A' },
    OVERDUE: { fg: '#C22E26', bg: '#FBE6E4', dot: '#E0473F' },
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.4 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.2 },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyMedium: { fontSize: 15, fontWeight: '600' as const },
  caption: { fontSize: 13, fontWeight: '500' as const },
  small: { fontSize: 12, fontWeight: '500' as const },
};

export const shadow = {
  card: {
    shadowColor: '#141726',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
};
