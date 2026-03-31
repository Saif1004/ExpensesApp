import { useEffect, useState } from "react";
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

const isExpoGo = Constants.executionEnvironment === "storeClient";
const SYNC_PLAN_URL = process.env.EXPO_PUBLIC_SYNC_PLAN_URL!;

//////////////////////////////////////////////////////
// HELPERS
//////////////////////////////////////////////////////

function PlanIcon({ plan }: { plan: OrgPlan }) {
  const configs: Record<string, { icon: React.ComponentProps<typeof Ionicons>["name"]; color: string; bg: string }> = {
    free:     { icon: "gift-outline",    color: "#94A3B8", bg: "#1E293B" },
    trial:    { icon: "time-outline",    color: "#F59E0B", bg: "#1C1208" },
    pro:      { icon: "flash-outline",   color: "#60A5FA", bg: "#0D1F3C" },
    business: { icon: "briefcase-outline", color: "#A78BFA", bg: "#1A0D3C" }
  };
  const cfg = configs[plan] ?? configs.free;
  return (
    <View style={[styles.planIconWrap, { backgroundColor: cfg.bg }]}>
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

  const [restoring, setRestoring] = useState(false);

  const planColors: Record<OrgPlan, string> = {
    free:     "#94A3B8",
    trial:    "#F59E0B",
    pro:      "#60A5FA",
    business: "#A78BFA"
  };

  const planColor = planColors[orgPlan ?? "free"] ?? "#94A3B8";
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
  // UI
  //////////////////////////////////////////////////////

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#38BDF8" />
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
            <FeatureRow icon="people-outline"       text={`Up to ${planInfo.employeeLimit} team members`} />
            <FeatureRow icon="sparkles-outline"     text={`${planInfo.aiCreditsPerPeriod} AI credits / month`} active={planInfo.aiCreditsPerPeriod > 0} />
            <FeatureRow icon="chatbubble-outline"   text="AI expense assistant" active={planInfo.chatbotAccess} />
            <FeatureRow icon="bar-chart-outline"    text="Analytics & reporting" active={planInfo.analyticsAccess} />
            <FeatureRow icon="card-outline"         text="Stripe reimbursements" active />
            <FeatureRow icon="receipt-outline"      text="Receipt OCR scanning" active={orgPlan !== "free"} />
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
              <Ionicons name="flash" size={18} color="#fff" style={{ marginRight: 8 }} />
              <ThemedText style={styles.upgradeBtnText}>View Plans & Pricing</ThemedText>
              <Ionicons name="chevron-forward" size={16} color="#fff" style={{ marginLeft: 4 }} />
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
                label="Manage in Play Store"
                sublabel="Cancel, pause or change your plan"
                onPress={handleManageInStore}
              />
              <ActionRow
                icon="swap-horizontal-outline"
                label="Switch Plans"
                sublabel="Upgrade or downgrade anytime"
                onPress={() => router.push("/plans")}
                isLast
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
              />
            </View>
          </View>
        )}

        {/* PRICING NOTE */}
        <View style={styles.pricingBox}>
          <Ionicons name="information-circle-outline" size={16} color="#475569" style={{ marginRight: 8, marginTop: 1 }} />
          <ThemedText style={styles.pricingText}>
            Subscriptions auto-renew. Pricing is per organisation — your whole team gets access. Cancel anytime via the Play Store.
          </ThemedText>
        </View>

        {/* PLAN PRICING REFERENCE */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>PLAN PRICING</ThemedText>
          <View style={styles.pricingCard}>
            <PricingRow plan="Pro"      monthly="£14.99/mo" annual="£11.99/mo (billed annually)" color="#60A5FA" />
            <PricingRow plan="Business" monthly="£34.99/mo" annual="£27.99/mo (billed annually)" color="#A78BFA" isLast />
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

//////////////////////////////////////////////////////
// SUB-COMPONENTS
//////////////////////////////////////////////////////

function FeatureRow({ icon, text, active = true }: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  text: string;
  active?: boolean;
}) {
  return (
    <View style={styles.featureRow}>
      <Ionicons name={icon} size={16} color={active ? "#38BDF8" : "#334155"} style={{ marginRight: 10 }} />
      <ThemedText style={[styles.featureText, !active && styles.featureTextInactive]}>{text}</ThemedText>
      <Ionicons
        name={active ? "checkmark-circle" : "close-circle"}
        size={16}
        color={active ? "#22C55E" : "#374151"}
      />
    </View>
  );
}

function ActionRow({ icon, label, sublabel, onPress, loading, isLast }: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  sublabel?: string;
  onPress?: () => void;
  loading?: boolean;
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionRow, !isLast && styles.actionRowBorder]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={loading}
    >
      <View style={styles.actionIconWrap}>
        <Ionicons name={icon} size={18} color="#38BDF8" />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.actionLabel}>{label}</ThemedText>
        {!!sublabel && <ThemedText style={styles.actionSublabel}>{sublabel}</ThemedText>}
      </View>
      {loading
        ? <ActivityIndicator size="small" color="#38BDF8" />
        : <Ionicons name="chevron-forward" size={16} color="#475569" />
      }
    </TouchableOpacity>
  );
}

function PricingRow({ plan, monthly, annual, color, isLast }: {
  plan: string;
  monthly: string;
  annual: string;
  color: string;
  isLast?: boolean;
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

//////////////////////////////////////////////////////
// STYLES
//////////////////////////////////////////////////////

const styles = StyleSheet.create({

  root: {
    flex: 1,
    backgroundColor: "#0F172A"
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1E293B"
  },

  headerTitle: {
    color: "#F8FAFC",
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
    backgroundColor: "#1E293B",
    borderRadius: 18,
    padding: 20,
    marginBottom: 28,
    borderWidth: 1.5,
    gap: 16
  },

  planIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center"
  },

  currentPlanLabel: {
    color: "#475569",
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
    color: "#64748B",
    fontSize: 12,
    fontWeight: "500"
  },

  section: {
    marginBottom: 24
  },

  sectionTitle: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 10,
    marginLeft: 2
  },

  featureCard: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: "#334155"
  },

  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#334155"
  },

  featureText: {
    flex: 1,
    color: "#CBD5E1",
    fontSize: 14
  },

  featureTextInactive: {
    color: "#334155"
  },

  upgradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 20
  },

  upgradeBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700"
  },

  actionCard: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#334155"
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
    borderBottomColor: "#334155"
  },

  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#0F2A3D",
    justifyContent: "center",
    alignItems: "center"
  },

  actionLabel: {
    color: "#F1F5F9",
    fontSize: 15,
    fontWeight: "500"
  },

  actionSublabel: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 1
  },

  pricingBox: {
    flexDirection: "row",
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#334155"
  },

  pricingText: {
    flex: 1,
    color: "#475569",
    fontSize: 12,
    lineHeight: 18
  },

  pricingCard: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#334155"
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
    borderBottomColor: "#334155"
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
    color: "#F1F5F9",
    fontSize: 14,
    fontWeight: "600"
  },

  pricingAnnual: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 1
  }

});
