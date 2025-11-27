import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { StyleSheet } from "react-native";

export default function ClaimsScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Claims</ThemedText>
      <ThemedText style={styles.subtitle}>
        View and manage your reimbursement claims.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0F172A",
    padding: 20,
    minHeight: "100%",
  },
  title: {
    fontSize: 30,
    color: "#F8FAFC",
    fontWeight: "bold",
  },
  subtitle: {
    color: "#94A3B8",
    marginTop: 6,
  },
});
