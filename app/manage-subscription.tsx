import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";

import { useAuth } from "./context/AuthProvider";
import { ThemedText } from "../components/themed-text";
import { PLAN_LIMITS, OrgPlan } from "../constants/planLimits";
import { useTheme } from "../hooks/useTheme";

const isExpoGo = Constants.executionEnvironment === "storeClient";
const SYNC_PLAN_URL = process.env.EXPO_PUBLIC_SYNC_PLAN_URL!;

//////////////////////////////////////////////////////
// HELPERS
//////////////////////////////////////////////////////

function PlanIcon({ plan }: { plan: OrgPlan }) {
  const { tokens: t } = useTheme();
  const configs: Record<string, { icon: React.ComponentProps<typeof Ionicons>["name"]; color: string; bg: string }> = {
    free:     { icon: "gift-outline",    color: t.textSecondary, bg: t.surface },
    trial:    { icon: "time-outline",    color: t.warning, bg: t.warningSurface },
    pro:      { icon: "flash-outline",   color: t.accent, bg: t.accentSurface },
    business: { icon: "briefcase-outline", color: "#A78BFA", bg: "#1A0D3C" }
  };
  const cfg = configs[plan] ?? configs.free;
  return (
    <View style={[{ width: 56, height: 56, borderRadius: 16, justifyContent: "center", alignItems: "center" }, { backgroundColor: cfg.bg }]}>
      <Ionicons name={cfg.icon} size={28} color={cfg.color} />
    </View>
  );
}

//////////////////////////////////////////////////////
// MAIN SCREEN
//////////////////////////////////////////////////////

export default function ManageSubscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, role, orgId, orgPlan, trialEndsAt, trialDaysLeft, refreshOrgPlan } = useAuth();
  const { tokens: t } = useTheme();

  const [restoring, setRestoring] = useState(false);

  const planColors: Record<OrgPlan, string> = {
    free:     t.textSecondary,
    trial:    t.warning,
    pro:      t.accent,
    business: "#A78BFA"
  };

  const planColor = planColors[orgPlan ?? "free"] ?? t.textSecondary;
  const planInfo = PLAN_LIMITS[orgPlan ?? "free"];

  //////////////////////////////////////////////////////
  // RESTORE PURCHASES
  //////////////////////////////////////////////////////

  const handleRestore = async () => {
    if (!orgId || role !== "admin" || Platform.OS === "web" || isExpoGo || __DEV__) {
      Alert.alert("Not available", "Restore purchases is only available in a production build.");
      return;
    }
    setRestoring(true);
    try {
      const Purchases = (await import("react-native-purchases")).default;
      await Purchases.restorePurchases();

      const token = await user!.getIdToken();
      const res = await fetch(SYNC_PLAN_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body:    JSON.stringify({ orgId }),
      });
      const data = await res.json();
      const newPlan: OrgPlan = data.plan ?? "free";
      await refreshOrgPlan();

      if (newPlan !== "free") {
        Alert.alert("Restored!", `Your ${PLAN_LIMITS[newPlan]?.label ?? newPlan} subscription has been restored.`);
      } else {
        Alert.alert("Nothing to restore", "No active subscription found for this account.");
      }
    } catch {
      Alert.alert("Error", "Could not restore purchases. Please try again.");
    } finally {
      setRestoring(false);
    }
  };

  //////////////////////////////////////////////////////
  // CANCEL / MANAGE
  //////////////////////////////////////////////////////

  const handleManageInStore = () => {
    if (Platform.OS === "ios") {
      Linking.openURL("https://apps.apple.com/account/subscriptions");
    } else {
      Linking.openURL("https://play.google.com/store/account/subscriptions?sku=claimio_pro&package=com.saif1004.claimio");
    }
  };

  //////////////////////////////////////////////////////
  // STYLES
  //////////////////////////////////////////////////////

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
      paddingTop: 20
    },

    currentPlanCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.surface,
      borderRadius: 18,
      padding: 20,
      marginBottom: 28,
      borderWidth: 1.5,
      gap: 16
    },

    currentPlanLabel: {
      color: t.textTertiary,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.2,
      marginBottom: 2
    },

    currentPlanName: {
      fontSize: 22,
      fontWeight: "800",
      marginBottom: 2
    },

    trialNote: {
      color: t.textSecondary,
      fontSize: 12,
      fontWeight: "500"
    },

    section: {
      marginBottom: 24
    },

    sectionTitle: {
      color: t.textTertiary,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.2,
      marginBottom: 10,
      marginLeft: 2
    },

    featureCard: {
      backgroundColor: t.surface,
      borderRadius: 16,
      padding: 4,
      borderWidth: 1,
      borderColor: t.border
    },

    featureRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border
    },

    featureText: {
      flex: 1,
      color: t.text,
      fontSize: 14
    },

    featureTextInactive: {
      color: t.border
    },

    upgradeBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.accent,
      borderRadius: 14,
      paddingVertical: 15,
      paddingHorizontal: 20
    },

    upgradeBtnText: {
      color: t.accentText,
      fontSize: 16,
      fontWeight: "700"
    },

    actionCard: {
      backgroundColor: t.surface,
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: t.border
    },

    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12
    },

    actionRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border
    },

    actionIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: t.accentSurface,
      justifyContent: "center",
      alignItems: "center"
    },

    actionLabel: {
      color: t.text,
      fontSize: 15,
      fontWeight: "500"
    },

    actionSublabel: {
      color: t.textSecondary,
      fontSize: 12,
      marginTop: 1
    },

    pricingBox: {
      flexDirection: "row",
      backgroundColor: t.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: t.border
    },

    pricingText: {
      flex: 1,
      color: t.textTertiary,
      fontSize: 12,
      lineHeight: 18
    },

    pricingCard: {
      backgroundColor: t.surface,
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: t.border
    },

    pricingRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12
    },

    pricingRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border
    },

    pricingPlanDot: {
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderWidth: 1
    },

    pricingPlanName: {
      fontSize: 12,
      fontWeight: "700"
    },

    pricingMonthly: {
      color: t.text,
      fontSize: 14,
      fontWeight: "600"
    },

    pricingAnnual: {
      color: t.textSecondary,
      fontSize: 11,
      marginTop: 1
    }

  }), [t]);

  //////////////////////////////////////////////////////
  // UI
  //////////////////////////////////////////////////////

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={t.accent} />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Subscription</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* CURRENT PLAN CARD */}
        <View style={[styles.currentPlanCard, { borderColor: planColor + "66" }]}>
          <PlanIcon plan={orgPlan ?? "free"} />
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.currentPlanLabel}>CURRENT PLAN</ThemedText>
            <ThemedText style={[styles.currentPlanName, { color: planColor }]}>
              {planInfo.label}
            </ThemedText>
            {orgPlan === "trial" && trialEndsAt && (
              <ThemedText style={styles.trialNote}>
                {trialDaysLeft > 0
                  ? `${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} remaining`
                  : "Trial expired"}
              </ThemedText>
            )}
            {(orgPlan === "pro" || orgPlan === "business") && (
              <ThemedText style={styles.trialNote}>Active · Auto-renews</ThemedText>
            )}
            {orgPlan === "free" && (
              <ThemedText style={styles.trialNote}>No active subscription</ThemedText>
            )}
          </View>
        </View>

        {/* PLAN FEATURES */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>WHAT'S INCLUDED</ThemedText>
          <View style={styles.featureCard}>
            <FeatureRow icon="people-outline"       text={`Up to ${planInfo.employeeLimit} team members`} styles={styles} t={t} />
            <FeatureRow icon="sparkles-outline"     text={`${planInfo.aiCreditsPerPeriod} AI credits / month`} active={planInfo.aiCreditsPerPeriod > 0} styles={styles} t={t} />
            <FeatureRow icon="chatbubble-outline"   text="AI expense assistant" active={planInfo.chatbotAccess} styles={styles} t={t} />
            <FeatureRow icon="bar-chart-outline"    text="Analytics & reporting" active={planInfo.analyticsAccess} styles={styles} t={t} />
            <FeatureRow icon="card-outline"         text="Stripe reimbursements" active styles={styles} t={t} />
            <FeatureRow icon="receipt-outline"      text="Receipt OCR scanning" active={orgPlan !== "free"} styles={styles} t={t} />
          </View>
        </View>

        {/* UPGRADE CTA */}
        {(orgPlan === "free" || orgPlan === "trial") && role === "admin" && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>UPGRADE YOUR PLAN</ThemedText>
            <TouchableOpacity
              style={styles.upgradeBtn}
              onPress={() => router.push("/plans")}
              activeOpacity={0.85}
            >
              <Ionicons name="flash" size={18} color={t.accentText} style={{ marginRight: 8 }} />
              <ThemedText style={styles.upgradeBtnText}>View Plans & Pricing</ThemedText>
              <Ionicons name="chevron-forward" size={16} color={t.accentText} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>
        )}

        {/* MANAGE SUBSCRIPTION */}
        {(orgPlan === "pro" || orgPlan === "business") && role === "admin" && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>MANAGE</ThemedText>
            <View style={styles.actionCard}>
              <ActionRow
                icon="storefront-outline"
                label={`Manage in ${Platform.OS === "ios" ? "App Store" : "Play Store"}`}
                sublabel="Cancel, pause or change your plan"
                onPress={handleManageInStore}
                styles={styles}
                t={t}
              />
              <ActionRow
                icon="swap-horizontal-outline"
                label="Switch Plans"
                sublabel="Upgrade or downgrade anytime"
                onPress={() => router.push("/plans")}
                isLast
                styles={styles}
                t={t}
              />
            </View>
          </View>
        )}

        {/* RESTORE PURCHASES */}
        {role === "admin" && Platform.OS !== "web" && !isExpoGo && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>TROUBLESHOOTING</ThemedText>
            <View style={styles.actionCard}>
              <ActionRow
                icon="refresh-outline"
                label="Restore Purchases"
                sublabel="Already subscribed? Tap to restore"
                onPress={handleRestore}
                loading={restoring}
                isLast
                styles={styles}
                t={t}
              />
            </View>
          </View>
        )}

        {/* PRICING NOTE */}
        <View style={styles.pricingBox}>
          <Ionicons name="information-circle-outline" size={16} color={t.textTertiary} style={{ marginRight: 8, marginTop: 1 }} />
          <ThemedText style={styles.pricingText}>
            Subscriptions auto-renew. Pricing is per organisation — your whole team gets access. Cancel anytime via the {Platform.OS === "ios" ? "App Store" : "Play Store"}.
          </ThemedText>
        </View>

        {/* PLAN PRICING REFERENCE */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>PLAN PRICING</ThemedText>
          <View style={styles.pricingCard}>
            <PricingRow plan="Pro"      monthly="£14.99/mo" annual="£11.99/mo (billed annually)" color={t.accent} styles={styles} />
            <PricingRow plan="Business" monthly="£34.99/mo" annual="£27.99/mo (billed annually)" color="#A78BFA" isLast styles={styles} />
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

//////////////////////////////////////////////////////
// SUB-COMPONENTS
//////////////////////////////////////////////////////

function FeatureRow({ icon, text, active = true, styles, t }: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  text: string;
  active?: boolean;
  styles: any;
  t: any;
}) {
  return (
    <View style={styles.featureRow}>
      <Ionicons name={icon} size={16} color={active ? t.accent : t.border} style={{ marginRight: 10 }} />
      <ThemedText style={[styles.featureText, !active && styles.featureTextInactive]}>{text}</ThemedText>
      <Ionicons
        name={active ? "checkmark-circle" : "close-circle"}
        size={16}
        color={active ? t.success : t.textTertiary}
      />
    </View>
  );
}

function ActionRow({ icon, label, sublabel, onPress, loading, isLast, styles, t }: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  sublabel?: string;
  onPress?: () => void;
  loading?: boolean;
  isLast?: boolean;
  styles: any;
  t: any;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionRow, !isLast && styles.actionRowBorder]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={loading}
    >
      <View style={styles.actionIconWrap}>
        <Ionicons name={icon} size={18} color={t.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.actionLabel}>{label}</ThemedText>
        {!!sublabel && <ThemedText style={styles.actionSublabel}>{sublabel}</ThemedText>}
      </View>
      {loading
        ? <ActivityIndicator size="small" color={t.accent} />
        : <Ionicons name="chevron-forward" size={16} color={t.textTertiary} />
      }
    </TouchableOpacity>
  );
}

function PricingRow({ plan, monthly, annual, color, isLast, styles }: {
  plan: string;
  monthly: string;
  annual: string;
  color: string;
  isLast?: boolean;
  styles: any;
}) {
  return (
    <View style={[styles.pricingRow, !isLast && styles.pricingRowBorder]}>
      <View style={[styles.pricingPlanDot, { backgroundColor: color + "33", borderColor: color + "66" }]}>
        <ThemedText style={[styles.pricingPlanName, { color }]}>{plan}</ThemedText>
      </View>
      <View style={{ flex: 1, alignItems: "flex-end" }}>
        <ThemedText style={styles.pricingMonthly}>{monthly}</ThemedText>
        <ThemedText style={styles.pricingAnnual}>{annual}</ThemedText>
      </View>
    </View>
  );
}
