import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';

export function HapticTab(props: BottomTabBarButtonProps) {
  const { children, onPressIn, ...rest } = props;

  return (
    <PlatformPressable
      {...rest}
      // expand the touch area so on-screen navigation buttons (e.g. Samsung) don't overlap
      // and make tabs hard to tap — this increases the tappable region without changing visuals
      hitSlop={{ top: 10, bottom: 18, left: 8, right: 8 }}
      // small press retention to avoid accidental cancels when finger slightly moves
      pressRetentionOffset={{ top: 6, bottom: 6, left: 6, right: 6 }}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === 'ios') {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPressIn?.(ev);
      }}
    >
      {children}
    </PlatformPressable>
  );
}
