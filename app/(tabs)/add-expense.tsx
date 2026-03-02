import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useState } from "react";
import { Alert, StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";
import { IconSymbol } from "../../components/ui/icon-symbol";
import { useAuth } from "../context/AuthProvider";
import { db } from "../firebase/firebaseConfig";

export default function AddExpenseScreen() {
  const { user } = useAuth();

  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!user) {
      Alert.alert("Not logged in", "Please sign in again.");
      return;
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      Alert.alert("Invalid amount", "Enter a valid amount.");
      return;
    }

    if (!merchant.trim()) {
      Alert.alert("Missing merchant", "Enter merchant name.");
      return;
    }

    if (!category.trim()) {
      Alert.alert("Missing category", "Enter category.");
      return;
    }

    try {
      setSaving(true);

      await addDoc(collection(db, "claims"), {
        userId: user.uid,
        userEmail: user.email ?? "",
        amount: Number(amount),
        merchant: merchant.trim(),
        category: category.trim(),
        status: "pending",
        createdAt: serverTimestamp(),
      });

      Alert.alert("Success", "Claim submitted for approval.");

      setAmount("");
      setMerchant("");
      setCategory("");
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Add Expense
      </ThemedText>

      <ThemedText style={styles.subtitle}>
        Upload a receipt or enter details.
      </ThemedText>

      {/* Upload Placeholder (OCR later) */}
      <TouchableOpacity style={styles.uploadBox}>
        <IconSymbol name="camera.fill" size={40} color="#38BDF8" />
        <ThemedText style={styles.uploadText}>Upload Receipt (Coming Soon)</ThemedText>
      </TouchableOpacity>

      {/* Manual Entry */}
      <ThemedView style={styles.card}>
        <ThemedText style={styles.cardTitle}>Manual Entry</ThemedText>

        <TextInput
          placeholder="Amount (£)"
          placeholderTextColor="#64748B"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          style={styles.input}
        />

        <TextInput
          placeholder="Merchant"
          placeholderTextColor="#64748B"
          value={merchant}
          onChangeText={setMerchant}
          style={styles.input}
        />

        <TextInput
          placeholder="Category"
          placeholderTextColor="#64748B"
          value={category}
          onChangeText={setCategory}
          style={styles.input}
        />

        <TouchableOpacity
          style={[styles.submitButton, saving && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={saving}
        >
          <ThemedText style={styles.submitText}>
            {saving ? "Submitting..." : "Submit Claim"}
          </ThemedText>
        </TouchableOpacity>
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
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#1E293B",
    color: "#F8FAFC",
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  submitButton: {
    backgroundColor: "#2563EB",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  submitText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});