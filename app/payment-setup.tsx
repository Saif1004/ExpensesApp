import React, { useMemo, useState, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStripe, CardField } from "@stripe/stripe-react-native";
import { auth, db } from "./firebase/firebaseConfig";
import { doc, onSnapshot } from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../hooks/useTheme";

const SETUP_URL = process.env.EXPO_PUBLIC_STRIPE_SETUP_PAYMENT_URL!;
const SAVE_URL = process.env.EXPO_PUBLIC_STRIPE_SAVE_PAYMENT_URL!;

export default function PaymentSetupScreen() {
  const router = useRouter();
  const { confirmSetupIntent } = useStripe();
  const { tokens: t } = useTheme();
  const [loading, setLoading] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [savedCard, setSavedCard] = useState<{ last4: string; brand: string } | null>(null);

  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      const data = snap.data();
      if (data?.stripeCardLast4) {
        setSavedCard({ last4: data.stripeCardLast4, brand: data.stripeCardBrand });
      }
    });
    return unsub;
  }, [user]);

  const handleSaveCard = async () => {
    if (!user || !cardComplete) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();

      // Get SetupIntent client secret from Azure
      const res = await fetch(SETUP_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const { clientSecret, error: setupError } = await res.json();
      if (setupError) throw new Error(setupError);

      // Confirm the card setup with Stripe
      const { setupIntent, error } = await confirmSetupIntent(clientSecret, {
        paymentMethodType: "Card",
      });
      if (error) throw new Error(error.message);

      // Save payment method ID to Firestore via Azure
      const saveRes = await fetch(SAVE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodId: setupIntent.paymentMethodId }),
      });
      const saveData = await saveRes.json();
      if (saveData.error) throw new Error(saveData.error);

      Alert.alert("Success", `${saveData.brand?.toUpperCase()} card ending in ${saveData.last4} saved.`);
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
    savedCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: "#4CAF5033",
    },
    savedLabel: { fontSize: 11, color: t.textSecondary, marginBottom: 2 },
    savedCardText: { fontSize: 16, color: t.text, fontWeight: "600" },
    sectionLabel: { fontSize: 13, color: t.textSecondary, marginBottom: 10 },
    cardField: { height: 50, marginBottom: 24 },
    button: {
      backgroundColor: t.accent,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
      marginBottom: 20,
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: t.accentText, fontWeight: "700", fontSize: 16 },
    infoBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      backgroundColor: t.surface,
      borderRadius: 10,
      padding: 14,
    },
    infoText: { color: t.textSecondary, fontSize: 12, lineHeight: 18, flex: 1 },
  }), [t]);

  const cardStyle = useMemo(() => ({
    backgroundColor: t.surface,
    textColor: t.text,
    placeholderColor: t.textTertiary,
    borderRadius: 10,
  }), [t]);

  return (
    <SafeAreaView style={styles.safe}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color={t.text} />
      </TouchableOpacity>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Payment Method</Text>
        <Text style={styles.subtitle}>
          Link your company card so approved expense claims are automatically reimbursed to employees.
        </Text>

        {savedCard && (
          <View style={styles.savedCard}>
            <Ionicons name="card" size={24} color="#4CAF50" />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.savedLabel}>Current payment method</Text>
              <Text style={styles.savedCardText}>
                {savedCard.brand?.toUpperCase()} •••• {savedCard.last4}
              </Text>
            </View>
          </View>
        )}

        <Text style={styles.sectionLabel}>{savedCard ? "Update card" : "Add card"}</Text>

        <CardField
          postalCodeEnabled={false}
          style={styles.cardField}
          cardStyle={cardStyle}
          onCardChange={(details) => setCardComplete(details.complete)}
        />

        <TouchableOpacity
          style={[styles.button, (!cardComplete || loading) && styles.buttonDisabled]}
          onPress={handleSaveCard}
          disabled={!cardComplete || loading}
        >
          {loading ? (
            <ActivityIndicator color={t.accentText} />
          ) : (
            <Text style={styles.buttonText}>{savedCard ? "Update Card" : "Save Card"}</Text>
          )}
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Ionicons name="lock-closed" size={14} color={t.textSecondary} />
          <Text style={styles.infoText}>
            Payments are processed securely via Stripe. Your card details are never stored on Claimio servers.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
