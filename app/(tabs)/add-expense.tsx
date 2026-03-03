import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";
import { IconSymbol } from "../../components/ui/icon-symbol";
import { useAuth } from "../context/AuthProvider";
import { db } from "../firebase/firebaseConfig";

const AZURE_VALIDATE_URL = process.env.EXPO_PUBLIC_AZURE_VALIDATE_URL!;

export default function AddExpenseScreen() {
  const { user } = useAuth();

  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
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

    if (!merchant.trim() || !category.trim() || !purchaseDate) {
      Alert.alert("Missing fields", "Please complete all fields.");
      return;
    }

    try {
      setSaving(true);

      // 🔥 1️⃣ Validate via Azure
      const response = await fetch(AZURE_VALIDATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(amount),
          category: category.trim(),
          purchaseDate,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.valid) {
        Alert.alert(
          "Policy Violation",
          result?.reason || "Claim rejected by policy engine."
        );
        setSaving(false);
        return;
      }

      // 🔥 2️⃣ Save to Firestore (MATCHES CLAIMS SCREEN)
      await addDoc(collection(db, "claims"), {
        userId: user.uid,
        userEmail: user.email ?? "",
        amount: Number(amount),
        merchant: merchant.trim(),
        category: category.trim(),
        purchaseDate,
        status: result.autoApprove ? "approved" : "pending",
        createdAt: serverTimestamp(), // 🔥 IMPORTANT
        statusUpdatedAt: serverTimestamp(),
        approvedBy: "",
        rejectedBy: "",
        rejectionReason: "",
      });

      Alert.alert("Success", "Claim submitted successfully.");

      setAmount("");
      setMerchant("");
      setCategory("");
      setPurchaseDate("");
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
        Claims are validated by cloud policy engine.
      </ThemedText>

      <TouchableOpacity style={styles.uploadBox}>
        <IconSymbol name="camera.fill" size={40} color="#38BDF8" />
        <ThemedText style={styles.uploadText}>
          Upload Receipt (Azure OCR Next)
        </ThemedText>
      </TouchableOpacity>

      <ThemedView style={styles.card}>
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

        <TextInput
          placeholder="Purchase Date (YYYY-MM-DD)"
          placeholderTextColor="#64748B"
          value={purchaseDate}
          onChangeText={setPurchaseDate}
          style={styles.input}
        />

        <TouchableOpacity
          style={[styles.submitButton, saving && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.submitText}>
              Submit Claim
            </ThemedText>
          )}
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
  },
  submitText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});