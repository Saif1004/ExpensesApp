import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';

export function HapticTab(props: BottomTabBarButtonProps) {
  const { children, onPressIn, ...rest } = props;

  return (
    <PlatformPressable
      {...rest}
    
      hitSlop={{ top: 10, bottom: 18, left: 8, right: 8 }}
      pressRetentionOffset={{ top: 6, bottom: 6, left: 6, right: 6 }}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === 'ios') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPressIn?.(ev);
      }}
    >
      {children}
    </PlatformPressable>
  );
}
