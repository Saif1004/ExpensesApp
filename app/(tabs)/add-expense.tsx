import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { StyleSheet, TouchableOpacity } from "react-native";

export default function AddExpenseScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Add Expense</ThemedText>
      <ThemedText style={styles.subtitle}>Upload a receipt or enter details.</ThemedText>

      <TouchableOpacity style={styles.uploadBox}>
        <IconSymbol name="camera.fill" size={40} color="#38BDF8" />
        <ThemedText style={styles.uploadText}>Upload Receipt</ThemedText>
      </TouchableOpacity>

      <ThemedView style={styles.card}>
        <ThemedText style={styles.cardTitle}>Manual Entry</ThemedText>
        <ThemedText style={styles.cardText}>
          Add merchant, amount, and category.
        </ThemedText>
      </ThemedView>
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
    fontSize: 32,
    color: "#F8FAFC",
    fontWeight: "bold",
    marginTop: 24,
  },
  subtitle: {
    color: "#94A3B8",
    marginBottom: 20,
  },
  uploadBox: {
    borderWidth: 2,
    borderColor: "#1E293B",
    borderStyle: "dashed",
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    marginBottom: 20,
  },
  uploadText: {
    color: "#38BDF8",
    marginTop: 10,
    fontSize: 16,
  },
  card: {
    backgroundColor: "rgba(30,41,59,0.95)",
    padding: 18,
    borderRadius: 14,
  },
  cardTitle: {
    color: "#E2E8F0",
    fontSize: 16,
    fontWeight: "700",
  },
  cardText: {
    color: "#94A3B8",
    marginTop: 6,
  },
  
});
