export type ThemeTokens = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderSubtle: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentPressed: string;
  accentSurface: string;
  accentText: string;
  success: string;
  successSurface: string;
  warning: string;
  warningSurface: string;
  error: string;
  errorSurface: string;
  tabBar: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;
  shadow: string;
  shadowOpacity: number;
  statusBar: 'light-content' | 'dark-content';
  radius: { sm: number; md: number; lg: number; xl: number; xxl: number };
};

const shared = {
  accent:        '#6366F1',
  accentPressed: '#4F46E5',
  accentText:    '#FFFFFF',
  success:       '#10B981',
  warning:       '#F59E0B',
  error:         '#EF4444',
  shadow:        '#000000',
  radius: { sm: 10, md: 14, lg: 18, xl: 22, xxl: 28 },
};

export const lightTheme: ThemeTokens = {
  ...shared,
  bg:             '#FFFFFF',
  surface:        '#F8F9FC',
  surfaceAlt:     '#EDEEF2',
  border:         '#E8ECF0',
  borderSubtle:   '#F0F2F5',
  text:           '#0D1B2A',
  textSecondary:  '#6B7A8D',
  textTertiary:   '#A0ACBB',
  accentSurface:  '#EEF2FF',
  successSurface: '#ECFDF5',
  warningSurface: '#FFFBEB',
  errorSurface:   '#FEF2F2',
  tabBar:         '#FFFFFF',
  tabBarBorder:   '#E8ECF0',
  tabBarActive:   '#6366F1',
  tabBarInactive: '#A0ACBB',
  shadowOpacity:  0.08,
  statusBar:      'dark-content',
};

export const darkTheme: ThemeTokens = {
  ...shared,
  bg:             '#080808',   // near-true-black
  surface:        '#111111',   // dark charcoal cards
  surfaceAlt:     '#161616',   // input / secondary surfaces
  border:         '#222222',   // barely-there separators
  borderSubtle:   '#161616',
  text:           '#F5F5F5',   // clean white (no blue tint)
  textSecondary:  '#888888',   // neutral mid-grey
  textTertiary:   '#555555',   // dim labels
  accentSurface:  '#13112C',   // deep purple tint
  successSurface: '#091A10',
  warningSurface: '#171208',
  errorSurface:   '#170808',
  tabBar:         '#000000',   // pure-black tab bar
  tabBarBorder:   '#000000',   // invisible — blends with tabBar
  tabBarActive:   '#6366F1',
  tabBarInactive: '#555555',
  shadowOpacity:  0,
  statusBar:      'light-content',
};

// Legacy — kept for any remaining references, remove once full migration is done
export const Colors = {
  light: { text: '#0D1B2A', background: '#FFFFFF', tint: '#6366F1', icon: '#6B7A8D', tabIconDefault: '#A0ACBB', tabIconSelected: '#6366F1' },
  dark:  { text: '#F0F4FF', background: '#0A0F1E', tint: '#6366F1', icon: '#5D7290', tabIconDefault: '#3D506A',  tabIconSelected: '#6366F1' },
};
