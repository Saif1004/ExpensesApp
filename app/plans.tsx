import { useMemo } from "react";
import { useRouter } from "expo-router";
import { TouchableOpacity, View, StyleSheet } from "react-native";
import PaywallScreen from "../components/paywall-screen";
import { ThemedText } from "../components/themed-text";
import { useTheme } from "../hooks/useTheme";

export default function PlansScreen() {
  const router = useRouter();
  const { tokens: t } = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.bg
    },
    header: {
      paddingTop: 56,
      paddingHorizontal: 20,
      paddingBottom: 8
    },
    backBtn: {
      alignSelf: "flex-start"
    },
    backText: {
      color: t.accent,
      fontSize: 17,
      fontWeight: "600"
    }
  }), [t]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ThemedText style={styles.backText}>‹ Back</ThemedText>
        </TouchableOpacity>
      </View>
      <PaywallScreen />
    </View>
  );
}
