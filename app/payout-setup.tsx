import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, SafeAreaView, ScrollView, Linking,
} from "react-native";
import { auth, db } from "./firebase/firebaseConfig";
import { doc, onSnapshot } from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

const CREATE_URL = process.env.EXPO_PUBLIC_STRIPE_CREATE_ACCOUNT_URL!;
const ONBOARDING_URL = process.env.EXPO_PUBLIC_STRIPE_ONBOARDING_LINK_URL!;
const CHECK_URL = process.env.EXPO_PUBLIC_STRIPE_CHECK_ONBOARDING_URL!;

export default function PayoutSetupScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [payoutAccount, setPayoutAccount] = useState<{ last4: string; brand: string; type: string } | null>(null);
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      const data = snap.data();
      setOnboardingComplete(data?.stripeOnboardingComplete === true);
      if (data?.stripePayoutLast4) {
        setPayoutAccount({
          last4: data.stripePayoutLast4,
          brand: data.stripePayoutBrand,
          type: data.stripePayoutType || "bank_account",
        });
      }
    });
    return unsub;
  }, [user]);

  // Check onboarding status every time screen gains focus (after returning from Stripe)
  useFocusEffect(
    React.useCallback(() => {
      checkOnboardingStatus();
    }, [])
  );

  const checkOnboardingStatus = async () => {
    if (!user) return;
    setChecking(true);
    try {
      const token = await user.getIdToken();
      await fetch(CHECK_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
    } catch (_) {
    } finally {
      setChecking(false);
    }
  };

  const handleSetupPayout = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();

      // Step 1: Create Connect account (or get existing)
      const createRes = await fetch(CREATE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const createData = await createRes.json();
      if (createData.error) throw new Error(createData.error);

      // Step 2: Get onboarding link
      const linkRes = await fetch(ONBOARDING_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const linkData = await linkRes.json();
      if (linkData.error) throw new Error(linkData.error);

      // Step 3: Open Stripe hosted onboarding in browser
      await Linking.openURL(linkData.url);
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Payout Account</Text>
        <Text style={styles.subtitle}>
          Set up your payout account so you can receive reimbursements directly when your expense claims are approved.
        </Text>

        {onboardingComplete ? (
          <View style={styles.completeBox}>
            <Ionicons name="checkmark-circle" size={48} color="#4CAF50" />
            <Text style={styles.completeTitle}>Payout Account Active</Text>
            {payoutAccount ? (
              <View style={styles.accountRow}>
                <Ionicons
                  name={payoutAccount.type === "card" ? "card" : "business"}
                  size={22}
                  color="#4CAF50"
                />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.accountLabel}>Current payout method</Text>
                  <Text style={styles.accountText}>
                    {payoutAccount.brand} •••• {payoutAccount.last4}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.completeText}>
                Approved expense claims will be reimbursed directly to your linked account.
              </Text>
            )}
            <TouchableOpacity
              style={styles.updateButton}
              onPress={handleSetupPayout}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#2196F3" />
              ) : (
                <Text style={styles.updateButtonText}>Update Payout Details</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.stepsContainer}>
              <Text style={styles.stepsTitle}>How it works</Text>
              {[
                { icon: "person-circle-outline", text: "We create a secure Stripe account for you" },
                { icon: "card-outline", text: "Add your bank account or debit card on Stripe's secure site" },
                { icon: "cash-outline", text: "Approved claims are automatically paid out to you" },
              ].map((step, i) => (
                <View key={i} style={styles.step}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                  </View>
                  <Ionicons name={step.icon as any} size={20} color="#2196F3" style={{ marginHorizontal: 10 }} />
                  <Text style={styles.stepText}>{step.text}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSetupPayout}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="open-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.buttonText}>Set Up Payout Account</Text>
                </>
              )}
            </TouchableOpacity>

            {checking && (
              <View style={styles.checkingRow}>
                <ActivityIndicator size="small" color="#888" />
                <Text style={styles.checkingText}>Checking account status...</Text>
              </View>
            )}
          </>
        )}

        <View style={styles.infoBox}>
          <Ionicons name="lock-closed" size={14} color="#888" />
          <Text style={styles.infoText}>
            Payouts are processed via Stripe. Claimio never stores your bank details.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0f1923" },
  backBtn: { padding: 16, alignSelf: "flex-start" },
  container: { padding: 24 },
  title: { fontSize: 24, fontWeight: "700", color: "#fff", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#888", marginBottom: 24, lineHeight: 20 },
  stepsContainer: {
    backgroundColor: "#1a2636",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  stepsTitle: { fontSize: 13, color: "#888", marginBottom: 14, fontWeight: "600" },
  step: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  stepNumber: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: "#2196F322", alignItems: "center", justifyContent: "center",
  },
  stepNumberText: { color: "#2196F3", fontSize: 12, fontWeight: "700" },
  stepText: { color: "#ccc", fontSize: 13, flex: 1 },
  button: {
    backgroundColor: "#2196F3", borderRadius: 12, paddingVertical: 14,
    alignItems: "center", flexDirection: "row", justifyContent: "center", marginBottom: 16,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  completeBox: {
    backgroundColor: "#1a2636", borderRadius: 12, padding: 24,
    alignItems: "center", marginBottom: 24, borderWidth: 1, borderColor: "#4CAF5033",
  },
  completeTitle: { fontSize: 18, fontWeight: "700", color: "#4CAF50", marginTop: 12, marginBottom: 12 },
  completeText: { fontSize: 13, color: "#888", textAlign: "center", lineHeight: 20 },
  accountRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#0f1923", borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: "#4CAF5033", marginBottom: 4,
  },
  accountLabel: { fontSize: 11, color: "#888", marginBottom: 2 },
  accountText: { fontSize: 16, color: "#fff", fontWeight: "600" },
  updateButton: { marginTop: 16, paddingVertical: 8, paddingHorizontal: 20 },
  updateButtonText: { color: "#2196F3", fontSize: 13, fontWeight: "600" },
  checkingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  checkingText: { color: "#888", fontSize: 13 },
  infoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#1a2636", borderRadius: 10, padding: 14,
  },
  infoText: { color: "#666", fontSize: 12, lineHeight: 18, flex: 1 },
});
