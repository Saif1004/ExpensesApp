import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { StyleSheet } from "react-native";

export default function AddExpenseScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Add Expense</ThemedText>
      <ThemedText style={styles.subtitle}>Create a new expense entry.</ThemedText>
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
    marginBottom: 8,
  },

  subtitle: {
    color: "#94A3B8",
  },
});
