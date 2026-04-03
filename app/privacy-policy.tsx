import { useMemo } from "react";
import { Linking, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "../components/themed-text";
import { useTheme } from "../hooks/useTheme";

const PRIVACY_POLICY_URL = "https://doc-hosting.flycricket.io/claimio-privacy-policy/93cdb913-08e1-433c-970b-c7465830037b/privacy";

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tokens: t } = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: t.bg
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border
    },
    headerTitle: {
      color: t.text,
      fontSize: 17,
      fontWeight: "700"
    },
    backBtn: {
      width: 40,
      height: 40,
      justifyContent: "center"
    },
    container: {
      paddingHorizontal: 20,
      paddingTop: 28,
      alignItems: "center"
    },
    iconWrap: {
      width: 88,
      height: 88,
      borderRadius: 24,
      backgroundColor: t.accentSurface,
      borderWidth: 1,
      borderColor: t.accentSurface,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 20
    },
    title: {
      color: t.text,
      fontSize: 24,
      fontWeight: "700",
      marginBottom: 6,
      textAlign: "center"
    },
    subtitle: {
      color: t.textTertiary,
      fontSize: 13,
      marginBottom: 28,
      textAlign: "center"
    },
    card: {
      width: "100%",
      backgroundColor: t.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: t.border
    },
    sectionHeading: {
      color: t.accent,
      fontSize: 14,
      fontWeight: "700",
      marginBottom: 8
    },
    body: {
      color: t.textSecondary,
      fontSize: 13,
      lineHeight: 20
    },
    fullPolicyBtn: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 8,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.accentSurface
    },
    fullPolicyText: {
      color: t.accent,
      fontSize: 14,
      fontWeight: "600"
    }
  }), [t]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={t.accent} />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Privacy Policy</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconWrap}>
          <Ionicons name="shield-checkmark" size={48} color={t.accent} />
        </View>

        <ThemedText style={styles.title}>Privacy Policy</ThemedText>
        <ThemedText style={styles.subtitle}>Last updated: March 2026</ThemedText>

        <View style={styles.card}>
          <ThemedText style={styles.sectionHeading}>Data We Collect</ThemedText>
          <ThemedText style={styles.body}>
            Claimio collects your name, email address, and expense data (receipts, amounts, merchant information) necessary to operate the expense management service. Payment information is processed securely via Stripe and never stored on our servers.
          </ThemedText>
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.sectionHeading}>How We Use Your Data</ThemedText>
          <ThemedText style={styles.body}>
            Your data is used solely to provide the Claimio expense management service — processing claims, generating analytics, and facilitating reimbursements. We do not sell or share your data with third parties for marketing purposes.
          </ThemedText>
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.sectionHeading}>Data Storage & Security</ThemedText>
          <ThemedText style={styles.body}>
            All data is stored in Firebase (Google Cloud) with encryption at rest and in transit. Receipt images are stored in Firebase Cloud Storage. Access is controlled by Firebase Security Rules that restrict each user to their own data.
          </ThemedText>
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.sectionHeading}>Your Rights</ThemedText>
          <ThemedText style={styles.body}>
            You have the right to access, correct, or delete your personal data at any time. You can delete your account directly in the app (Profile → Delete Account), which permanently removes all your data from our systems.
          </ThemedText>
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.sectionHeading}>Third-Party Services</ThemedText>
          <ThemedText style={styles.body}>
            Claimio uses Firebase (authentication & database), Stripe (payments), RevenueCat (subscriptions), and Microsoft Azure (AI processing). Each service operates under their own privacy policies and data processing agreements.
          </ThemedText>
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.sectionHeading}>Contact Us</ThemedText>
          <ThemedText style={styles.body}>
            For privacy concerns or data requests, contact us at support@claimio.org
          </ThemedText>
        </View>

        <TouchableOpacity
          style={styles.fullPolicyBtn}
          onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
          activeOpacity={0.8}
        >
          <Ionicons name="open-outline" size={16} color={t.accent} style={{ marginRight: 8 }} />
          <ThemedText style={styles.fullPolicyText}>View Full Privacy Policy</ThemedText>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}
