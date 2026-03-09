import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, StyleProp, TextStyle } from 'react-native';

type IconMapping =
  Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;

type IconSymbolName = keyof typeof MAPPING;

/**
 * SF Symbol → Material Icon mapping
 */
const MAPPING = {
  // Navigation
  'house.fill': 'home',
  'doc.text.fill': 'description',
  'person.crop.circle.fill': 'account-circle',
  'plus.circle.fill': 'add-circle',

  // Charts / analytics
  'chart.bar.xaxis': 'show-chart',

  // Messaging / actions
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',

  // NEW icons (fix for Android)
  'shield.fill': 'shield',
  'questionmark.circle.fill': 'help',
} as IconMapping;

/**
 * Cross-platform icon component
 *
 * iOS → SF Symbols
 * Android / Web → Material Icons
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {

  const mappedIcon = MAPPING[name] ?? 'help';

  return (
    <MaterialIcons
      name={mappedIcon}
      size={size}
      color={color}
      style={style}
    />
  );
}