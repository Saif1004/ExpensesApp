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
  accent:        '#0066FF',   // electric blue — modern fintech
  accentPressed: '#0052CC',
  accentText:    '#FFFFFF',
  success:       '#34C759',   // Apple green
  warning:       '#FF9500',   // Apple amber
  error:         '#FF3B30',   // Apple red
  shadow:        '#000000',
  radius: { sm: 10, md: 14, lg: 18, xl: 22, xxl: 28 },
};

export const lightTheme: ThemeTokens = {
  ...shared,
  bg:             '#FFFFFF',
  surface:        '#F2F2F7',   // Apple system gray 6
  surfaceAlt:     '#E5E5EA',   // Apple system gray 5
  border:         '#C7C7CC',   // Apple system gray 3
  borderSubtle:   '#D1D1D6',   // Apple system gray 4
  text:           '#000000',
  textSecondary:  '#6C6C70',   // Apple system gray 2
  textTertiary:   '#AEAEB2',   // Apple system gray
  accentSurface:  '#E5F0FF',
  successSurface: '#E8F8EE',
  warningSurface: '#FFF3E0',
  errorSurface:   '#FFF0EE',
  tabBar:         '#FFFFFF',
  tabBarBorder:   '#C7C7CC',
  tabBarActive:   '#0066FF',
  tabBarInactive: '#AEAEB2',
  shadowOpacity:  0.08,
  statusBar:      'dark-content',
};

export const darkTheme: ThemeTokens = {
  ...shared,
  bg:             '#000000',   // true black — Uber/Revolut
  surface:        '#1C1C1E',   // Apple dark surface
  surfaceAlt:     '#2C2C2E',   // Apple dark alt
  border:         '#38383A',   // Apple dark border
  borderSubtle:   '#2C2C2E',
  text:           '#FFFFFF',
  textSecondary:  '#8E8E93',   // Apple dark secondary
  textTertiary:   '#48484A',   // Apple dark tertiary
  accentSurface:  '#001A3D',
  successSurface: '#001A0E',
  warningSurface: '#1A0C00',
  errorSurface:   '#1A0100',
  tabBar:         '#000000',
  tabBarBorder:   '#000000',
  tabBarActive:   '#0066FF',
  tabBarInactive: '#48484A',
  shadowOpacity:  0,
  statusBar:      'light-content',
};

// Legacy — kept for any remaining references, remove once full migration is done
export const Colors = {
  light: { text: '#000000', background: '#FFFFFF', tint: '#0066FF', icon: '#6C6C70', tabIconDefault: '#AEAEB2', tabIconSelected: '#0066FF' },
  dark:  { text: '#FFFFFF', background: '#000000', tint: '#0066FF', icon: '#8E8E93', tabIconDefault: '#48484A',  tabIconSelected: '#0066FF' },
};
