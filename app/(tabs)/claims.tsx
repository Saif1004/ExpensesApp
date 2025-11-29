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

      <ThemedView style={styles.card}>
        <ThemedText style={styles.cardTitle}>No Claims Submitted</ThemedText>
        <ThemedText style={styles.cardText}>
          Submit an expense to create a claim.
        </ThemedText>
      </ThemedView>
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
    fontSize: 32,
    fontWeight: "bold",
    color: "#F8FAFC",
  },
  subtitle: {
    color: "#94A3B8",
    marginBottom: 18,
  },
  card: {
    backgroundColor: "rgba(30,41,59,0.95)",
    padding: 18,
    borderRadius: 14,
  },
  cardTitle: {
    color: "#E2E8F0",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 6,
  },
  cardText: {
    color: "#94A3B8",
  },
});
