import { useRouter } from "expo-router";
import { TouchableOpacity, View, StyleSheet } from "react-native";
import PaywallScreen from "../components/paywall-screen";
import { ThemedText } from "../components/themed-text";

export default function PlansScreen() {
  const router = useRouter();

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A"
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
    color: "#60A5FA",
    fontSize: 17,
    fontWeight: "600"
  }
});
