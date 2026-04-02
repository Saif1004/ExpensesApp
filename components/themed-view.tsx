import { View, type ViewProps } from 'react-native';
import { useTheme } from '../hooks/useTheme';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
};

export function ThemedView({ style, lightColor, darkColor, ...otherProps }: ThemedViewProps) {
  const { tokens: t, mode } = useTheme();
  const backgroundColor = (mode === 'light' ? lightColor : darkColor) ?? t.surface;

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
