import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { StyleSheet } from "react-native";

export default function ProfileScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Profile</ThemedText>
      <ThemedText style={styles.subtitle}>
        Manage your account information.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#0F172A",
    minHeight: "100%",
  },
  title: {
    fontSize: 30,
    color: "#F8FAFC",
    fontWeight: "bold",
    marginBottom: 10,
  },
  subtitle: {
    color: "#94A3B8",
  },
});
