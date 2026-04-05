import React, { useMemo, useState, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, SafeAreaView, ScrollView, RefreshControl,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { auth, db } from "./firebase/firebaseConfig";
import { doc, onSnapshot } from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../hooks/useTheme";

const CREATE_URL = process.env.EXPO_PUBLIC_STRIPE_CREATE_ACCOUNT_URL!;
const ONBOARDING_URL = process.env.EXPO_PUBLIC_STRIPE_ONBOARDING_LINK_URL!;
const CHECK_URL = process.env.EXPO_PUBLIC_STRIPE_CHECK_ONBOARDING_URL!;

export default function PayoutSetupScreen() {
  const router = useRouter();
  const { tokens: t } = useTheme();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [payoutAccount, setPayoutAccount] = useState<{ last4: string; brand: string; type: string } | null>(null);
  const user = auth.currentUser;

  // Real-time listener — updates UI as soon as Firestore is written
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
      } else {
        setPayoutAccount(null);
      }
    });
    return unsub;
  }, [user]);

  const checkOnboardingStatus = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch(CHECK_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
    } catch (_) {}
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await checkOnboardingStatus();
    setRefreshing(false);
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

      // Step 3: Open Stripe onboarding — openBrowserAsync resolves when the user
      // closes the browser on both iOS and Android (unlike Linking.openURL which
      // doesn't resolve reliably on Android Chrome Custom Tabs).
      await WebBrowser.openBrowserAsync(linkData.url, {
        dismissButtonStyle: "close",
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });

      // Step 4: Browser closed — check if onboarding completed
      await checkOnboardingStatus();

    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  const styles = useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.bg },
    backBtn: { padding: 16, alignSelf: "flex-start" },
    container: { padding: 24 },
    title: { fontSize: 24, fontWeight: "700", color: t.text, marginBottom: 8 },
    subtitle: { fontSize: 14, color: t.textSecondary, marginBottom: 24, lineHeight: 20 },
    stepsContainer: {
      backgroundColor: t.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 24,
    },
    stepsTitle: { fontSize: 13, color: t.textSecondary, marginBottom: 14, fontWeight: "600" },
    step: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
    stepNumber: {
      width: 24, height: 24, borderRadius: 12,
      backgroundColor: t.accentSurface, alignItems: "center", justifyContent: "center",
    },
    stepNumberText: { color: t.accent, fontSize: 12, fontWeight: "700" },
    stepText: { color: t.text, fontSize: 13, flex: 1 },
    button: {
      backgroundColor: t.accent, borderRadius: 12, paddingVertical: 14,
      alignItems: "center", flexDirection: "row", justifyContent: "center", marginBottom: 16,
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: t.accentText, fontWeight: "700", fontSize: 16 },
    completeBox: {
      backgroundColor: t.surface, borderRadius: 12, padding: 24,
      alignItems: "center", marginBottom: 24, borderWidth: 1, borderColor: "#4CAF5033",
    },
    completeTitle: { fontSize: 18, fontWeight: "700", color: "#4CAF50", marginTop: 12, marginBottom: 12 },
    completeText: { fontSize: 13, color: t.textSecondary, textAlign: "center", lineHeight: 20 },
    accountRow: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: t.bg, borderRadius: 10, padding: 14,
      borderWidth: 1, borderColor: "#4CAF5033", marginBottom: 4,
    },
    accountLabel: { fontSize: 11, color: t.textSecondary, marginBottom: 2 },
    accountText: { fontSize: 16, color: t.text, fontWeight: "600" },
    updateButton: { marginTop: 16, paddingVertical: 8, paddingHorizontal: 20 },
    updateButtonText: { color: t.accent, fontSize: 13, fontWeight: "600" },
    infoBox: {
      flexDirection: "row", alignItems: "flex-start", gap: 8,
      backgroundColor: t.surface, borderRadius: 10, padding: 14,
    },
    infoText: { color: t.textSecondary, fontSize: 12, lineHeight: 18, flex: 1 },
  }), [t]);

  return (
    <SafeAreaView style={styles.safe}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color={t.text} />
      </TouchableOpacity>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={t.accent}
            colors={[t.accent]}
          />
        }
      >
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
                <ActivityIndicator color={t.accent} />
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
                  <Ionicons name={step.icon as any} size={20} color={t.accent} style={{ marginHorizontal: 10 }} />
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
                <ActivityIndicator color={t.accentText} />
              ) : (
                <>
                  <Ionicons name="open-outline" size={18} color={t.accentText} style={{ marginRight: 8 }} />
                  <Text style={styles.buttonText}>Set Up Payout Account</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

        <View style={styles.infoBox}>
          <Ionicons name="lock-closed" size={14} color={t.textSecondary} />
          <Text style={styles.infoText}>
            Payouts are processed via Stripe. Claimio never stores your bank details.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
