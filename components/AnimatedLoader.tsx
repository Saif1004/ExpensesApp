/**
 * AnimatedLoader
 *
 * Reusable loading component with a pulsing spinner and cycling status messages.
 * Use as a full-screen overlay (overlay=true) or inline inside a view.
 *
 * Props:
 *   messages  – array of strings to cycle through (default: generic ones)
 *   visible   – show/hide without unmounting (default: true)
 *   overlay   – fills the screen with a semi-transparent backdrop (default: false)
 *   intervalMs – how long each message shows (default: 1800ms)
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  View,
} from "react-native";
import { useThemeContext } from "../app/context/ThemeContext";
import { ThemedText } from "./themed-text";

const DEFAULT_MESSAGES = [
  "Loading…",
  "Almost there…",
  "Just a moment…",
];

interface Props {
  messages?:   string[];
  visible?:    boolean;
  overlay?:    boolean;
  intervalMs?: number;
}

export default function AnimatedLoader({
  messages   = DEFAULT_MESSAGES,
  visible    = true,
  overlay    = false,
  intervalMs = 1800,
}: Props) {
  const { tokens: t } = useThemeContext();

  // ── cycling message ──────────────────────────────────────────────────
  const [msgIndex, setMsgIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible || messages.length <= 1) return;

    const cycle = setInterval(() => {
      // fade out → swap text → fade in
      Animated.timing(fadeAnim, {
        toValue:         0,
        duration:        300,
        useNativeDriver: true,
        easing:          Easing.out(Easing.ease),
      }).start(() => {
        setMsgIndex(i => (i + 1) % messages.length);
        Animated.timing(fadeAnim, {
          toValue:         1,
          duration:        400,
          useNativeDriver: true,
          easing:          Easing.in(Easing.ease),
        }).start();
      });
    }, intervalMs);

    return () => clearInterval(cycle);
  }, [visible, messages, intervalMs]);

  // ── spinner rotation ─────────────────────────────────────────────────
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue:         1,
        duration:        900,
        useNativeDriver: true,
        easing:          Easing.linear,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [visible]);

  const spin = spinAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // ── dot pulse ────────────────────────────────────────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible]);

  if (!visible) return null;

  const content = (
    <View style={styles.inner}>
      {/* spinner ring */}
      <Animated.View style={[
        styles.ring,
        { borderColor: t.accent, transform: [{ rotate: spin }] },
      ]}>
        <Animated.View style={[
          styles.dot,
          { backgroundColor: t.accent, transform: [{ scale: pulseAnim }] },
        ]} />
      </Animated.View>

      {/* cycling message */}
      <Animated.View style={{ opacity: fadeAnim, marginTop: 20 }}>
        <ThemedText style={[styles.message, { color: t.textSecondary }]}>
          {messages[msgIndex]}
        </ThemedText>
      </Animated.View>
    </View>
  );

  if (overlay) {
    return (
      <View style={[styles.overlay, { backgroundColor: t.bg + "E8" }]}>
        {content}
      </View>
    );
  }

  return <View style={styles.centered}>{content}</View>;
}

const RING_SIZE = 56;
const DOT_SIZE  = 10;

const styles = StyleSheet.create({
  centered: {
    flex:           1,
    justifyContent: "center",
    alignItems:     "center",
    paddingVertical: 40,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems:     "center",
    zIndex:         999,
  },
  inner: {
    alignItems: "center",
  },
  ring: {
    width:        RING_SIZE,
    height:       RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth:  3,
    borderStyle:  "solid",
    // bottom-right quarter transparent gives a gap that shows rotation
    borderTopColor:    "transparent",
    justifyContent:    "flex-start",
    alignItems:        "flex-end",
    padding:           4,
  },
  dot: {
    width:        DOT_SIZE,
    height:       DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  message: {
    fontSize:      15,
    fontWeight:    "500",
    letterSpacing: 0.2,
    textAlign:     "center",
  },
});
