import type { PropsWithChildren, ReactElement } from "react";
import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet } from "react-native";
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
} from "react-native-reanimated";

import { ThemedView } from "../components/themed-view";
import { useColorScheme } from "../hooks/use-color-scheme";
import { useTheme } from "../hooks/useTheme";

const HEADER_HEIGHT = 125;

type Props = PropsWithChildren<{
  headerImage: ReactElement;
  headerBackgroundColor: { dark: string; light: string };
  contentContainerStyle?: StyleProp<ViewStyle>;
}>;

export default function ParallaxScrollView({
  children,
  headerImage,
  headerBackgroundColor,
  contentContainerStyle,
}: Props) {

  const colorScheme = useColorScheme() ?? "dark";
  const { tokens: t } = useTheme();

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);

  const headerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: interpolate(
            scrollOffset.value,
            [-HEADER_HEIGHT, 0, HEADER_HEIGHT],
            [-HEADER_HEIGHT / 2, 0, HEADER_HEIGHT * 0.6]
          ),
        },
        {
          scale: interpolate(
            scrollOffset.value,
            [-HEADER_HEIGHT, 0, HEADER_HEIGHT],
            [1.2, 1, 1],
          ),
        },
      ],
    };
  });

  const styles = useMemo(() => StyleSheet.create({

    scroll:{
      flex:1,
      backgroundColor: t.bg
    },

    header:{
      height:HEADER_HEIGHT,
      justifyContent:"flex-end",
      alignItems:"flex-end",
      paddingRight:20,
      paddingBottom:10
    },

    content:{
      backgroundColor: t.bg,
      paddingBottom:120
    }

  }), [t]);

  return (
    <Animated.ScrollView
      ref={scrollRef}
      style={styles.scroll}
      scrollEventThrottle={16}
    >

      {/* HEADER */}

      <Animated.View
        style={[
          styles.header,
          { backgroundColor: headerBackgroundColor[colorScheme] },
          headerAnimatedStyle,
        ]}
      >
        {headerImage}
      </Animated.View>

      {/* CONTENT */}

      <ThemedView style={[styles.content, contentContainerStyle]}>
        {children}
      </ThemedView>

    </Animated.ScrollView>
  );
}