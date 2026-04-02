import { useMemo } from "react";
import { Linking, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "../components/themed-text";
import { useTheme } from "../hooks/useTheme";

const TERMS_URL = "https://doc-hosting.flycricket.io/claimio-terms-of-use/862d3297-eafe-45a3-baea-403993b72e76/terms";

export default function TermsScreen() {
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
      borderColor: t.accent + "55",
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
    fullTermsBtn: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 8,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.accent + "55"
    },
    fullTermsText: {
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
        <ThemedText style={styles.headerTitle}>Terms & Conditions</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconWrap}>
          <Ionicons name="document-text" size={48} color={t.accent} />
        </View>

        <ThemedText style={styles.title}>Terms & Conditions</ThemedText>
        <ThemedText style={styles.subtitle}>Last updated: March 2026</ThemedText>

        <View style={styles.card}>
          <ThemedText style={styles.sectionHeading}>Acceptance of Terms</ThemedText>
          <ThemedText style={styles.body}>
            By using Claimio, you agree to these Terms & Conditions. Claimio is a B2B expense management platform intended for use by businesses and their employees. Access requires a valid organisation account.
          </ThemedText>
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.sectionHeading}>Subscription & Billing</ThemedText>
          <ThemedText style={styles.body}>
            Paid subscriptions are billed on a monthly or annual basis. Subscriptions auto-renew unless cancelled before the renewal date. Cancellations take effect at the end of the current billing period. No refunds are provided for partial periods.
          </ThemedText>
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.sectionHeading}>Free Trial</ThemedText>
          <ThemedText style={styles.body}>
            New organisations are eligible for one 7-day free trial of Pro features. The trial is non-transferable and may only be used once per organisation. After the trial ends, the account reverts to the Free plan unless upgraded.
          </ThemedText>
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.sectionHeading}>Acceptable Use</ThemedText>
          <ThemedText style={styles.body}>
            You agree not to use Claimio for fraudulent expense claims, to misrepresent receipts or amounts, or to circumvent expense policies. Organisations are responsible for ensuring their employees use the platform in accordance with company policy and applicable law.
          </ThemedText>
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.sectionHeading}>Payment Processing</ThemedText>
          <ThemedText style={styles.body}>
            Reimbursement payments are processed via Stripe. Claimio is not liable for payment delays, failures, or disputes arising from Stripe's platform. Admins must ensure their payment method is valid and their Stripe account is fully verified before processing reimbursements.
          </ThemedText>
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.sectionHeading}>Limitation of Liability</ThemedText>
          <ThemedText style={styles.body}>
            Claimio is provided "as is" without warranty of any kind. We are not liable for any indirect, incidental, or consequential damages arising from your use of the service. Our total liability shall not exceed the amount paid by you in the 12 months preceding the claim.
          </ThemedText>
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.sectionHeading}>Governing Law</ThemedText>
          <ThemedText style={styles.body}>
            These Terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.
          </ThemedText>
        </View>

        <TouchableOpacity
          style={styles.fullTermsBtn}
          onPress={() => Linking.openURL(TERMS_URL)}
          activeOpacity={0.8}
        >
          <Ionicons name="open-outline" size={16} color={t.accent} style={{ marginRight: 8 }} />
          <ThemedText style={styles.fullTermsText}>View Full Terms & Conditions</ThemedText>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}
