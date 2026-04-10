import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View
} from "react-native";
import Constants from "expo-constants";

const isExpoGo = Constants.executionEnvironment === "storeClient";

const START_TRIAL_URL = process.env.EXPO_PUBLIC_START_TRIAL_URL!;
const SYNC_PLAN_URL   = process.env.EXPO_PUBLIC_SYNC_PLAN_URL!;

import { PLAN_LIMITS, OrgPlan } from "../constants/planLimits";
import { useAuth } from "../app/context/AuthProvider";
import { ThemedText } from "./themed-text";
import { useTheme } from "../hooks/useTheme";

//////////////////////////////////////////////////////
// TYPES
//////////////////////////////////////////////////////

type BillingPeriod = "monthly" | "annual";

type PkgInfo = {
  pkg: unknown;
  priceString: string;
};

type PlanPackages = {
  proMonthly:       PkgInfo | null;
  proAnnual:        PkgInfo | null;
  businessMonthly:  PkgInfo | null;
  businessAnnual:   PkgInfo | null;
};

//////////////////////////////////////////////////////
// FEATURE LISTS
//////////////////////////////////////////////////////

const FEATURES_FREE = [
  "Submit & track expense claims",
  "Receipt photo uploads",
  "Real-time claim status updates",
  "Up to 5 team members",
  "Up to 10 claims per month"
];

const FEATURES_PRO = [
  "Everything in Free",
  "Unlimited claims",
  "AI-powered receipt OCR scanning",
  "Analytics & spending reports",
  "CSV, Excel & PDF exports",
  "Email & push notifications",
  "Admin digest emails (daily/weekly)",
  "AI expense assistant chatbot",
  "50 AI credits / month",
  "Custom expense categories",
  "Stripe automated reimbursements",
  "Up to 20 team members"
];

const FEATURES_BUSINESS = [
  "Everything in Pro",
  "Xero, QuickBooks & Sage exports",
  "Custom accounting codes per category",
  "150 AI credits / month",
  "Up to 100 team members",
  "Priority support"
];

//////////////////////////////////////////////////////
// COMPONENT
//////////////////////////////////////////////////////

export default function PaywallScreen() {

  const {
    user,
    role,
    orgId,
    orgPlan,
    isPro,
    trialEndsAt,
    trialDaysLeft,
    refreshOrgPlan
  } = useAuth();

  const { tokens: t } = useTheme();

  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [startingTrial, setStartingTrial] = useState(false);

  const [packages, setPackages] = useState<PlanPackages>({
    proMonthly:      null,
    proAnnual:       null,
    businessMonthly: null,
    businessAnnual:  null
  });

  const [offeringsLoaded, setOfferingsLoaded] = useState(false);
  const [purchasing,      setPurchasing]      = useState<string | null>(null);
  const [restoring,       setRestoring]       = useState(false);

  //////////////////////////////////////////////////////
  // LOAD REVENUECAT OFFERINGS
  //////////////////////////////////////////////////////

  useEffect(() => {
    if (Platform.OS === "web" || isExpoGo || __DEV__) {
      setOfferingsLoaded(true);
      return;
    }

    (async () => {
      try {
        const Purchases = (await import("react-native-purchases")).default;
        const offerings = await Purchases.getOfferings();
        const pkgs      = offerings.current?.availablePackages ?? [];

        const next: PlanPackages = {
          proMonthly:      null,
          proAnnual:       null,
          businessMonthly: null,
          businessAnnual:  null
        };

        for (const pkg of pkgs) {
          const id: string          = (pkg as any).identifier ?? "";
          const priceString: string = (pkg as any).product?.priceString ?? "";
          const info: PkgInfo       = { pkg, priceString };

          if      (id === PLAN_LIMITS.pro.rcPackageId)            next.proMonthly      = info;
          else if (id === PLAN_LIMITS.pro.rcAnnualPackageId)       next.proAnnual       = info;
          else if (id === PLAN_LIMITS.business.rcPackageId)        next.businessMonthly = info;
          else if (id === PLAN_LIMITS.business.rcAnnualPackageId)  next.businessAnnual  = info;
        }

        setPackages(next);
      } catch (err) {
        console.log("Offerings load error:", err);
      } finally {
        setOfferingsLoaded(true);
      }
    })();
  }, []);

  //////////////////////////////////////////////////////
  // PURCHASE
  //////////////////////////////////////////////////////

  const handlePurchase = async (targetPlan: "pro" | "business") => {
    if (!orgId || !user) return;

    if (role !== "admin") {
      Alert.alert("Admin required", "Ask your organisation admin to upgrade the plan.");
      return;
    }

    if (Platform.OS === "web" || isExpoGo || __DEV__) {
      Alert.alert("Not available", "Subscriptions can only be purchased in a production build.");
      return;
    }

    const pkgInfo = billingPeriod === "monthly"
      ? (targetPlan === "pro" ? packages.proMonthly      : packages.businessMonthly)
      : (targetPlan === "pro" ? packages.proAnnual        : packages.businessAnnual);

    if (!pkgInfo) {
      Alert.alert("Not available", "Product not found. Please try again later.");
      return;
    }

    const purchaseKey = `${targetPlan}_${billingPeriod}`;
    setPurchasing(purchaseKey);

    try {
      const Purchases = (await import("react-native-purchases")).default;
      await Purchases.purchasePackage(pkgInfo.pkg as any);

      // Verify purchase server-side and write plan via Admin SDK
      // (client cannot write `plan` directly — Firestore rules block it)
      const token  = await user!.getIdToken();
      const syncRes = await fetch(SYNC_PLAN_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body:    JSON.stringify({ orgId }),
      });
      const syncData = await syncRes.json();
      const newPlan: OrgPlan = syncData.plan ?? targetPlan;

      await refreshOrgPlan();
      Alert.alert("Subscribed!", `Welcome to ${PLAN_LIMITS[newPlan]?.label ?? newPlan}! Your whole team now has access.`);
    } catch (err: any) {
      if (!err?.userCancelled) {
        Alert.alert("Purchase failed", "Something went wrong. Please try again.");
      }
    } finally {
      setPurchasing(null);
    }
  };

  //////////////////////////////////////////////////////
  // START FREE TRIAL
  //////////////////////////////////////////////////////

  const handleStartTrial = async () => {
    if (!orgId || !user) return;
    if (role !== "admin") {
      Alert.alert("Admin required", "Ask your organisation admin to start the trial.");
      return;
    }
    setStartingTrial(true);
    try {
      const token = await user.getIdToken();
      const res   = await fetch(START_TRIAL_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body:    JSON.stringify({ orgId }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Error", data.error ?? "Could not start trial. Please try again.");
        return;
      }
      await refreshOrgPlan();
      Alert.alert("Trial Started!", "Your organisation has 7 days of Pro access for free. No payment needed.");
    } catch {
      Alert.alert("Error", "Could not start trial. Please try again.");
    } finally {
      setStartingTrial(false);
    }
  };

  //////////////////////////////////////////////////////
  // RESTORE
  //////////////////////////////////////////////////////

  const handleRestore = async () => {
    if (!orgId || role !== "admin" || Platform.OS === "web" || isExpoGo || __DEV__) return;
    setRestoring(true);
    try {
      const Purchases = (await import("react-native-purchases")).default;
      await Purchases.restorePurchases();

      // Verify restored entitlements server-side and write plan via Admin SDK
      const token   = await user!.getIdToken();
      const syncRes = await fetch(SYNC_PLAN_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body:    JSON.stringify({ orgId }),
      });
      const syncData = await syncRes.json();
      const newPlan: OrgPlan = syncData.plan ?? "free";

      await refreshOrgPlan();

      if (newPlan !== "free") {
        Alert.alert("Restored", `Your ${PLAN_LIMITS[newPlan]?.label ?? newPlan} subscription has been restored.`);
      } else {
        Alert.alert("Nothing to restore", "No active subscription found.");
      }
    } catch {
      Alert.alert("Error", "Could not restore purchases. Please try again.");
    } finally {
      setRestoring(false);
    }
  };

  //////////////////////////////////////////////////////
  // HELPERS
  //////////////////////////////////////////////////////

  const getPriceLabel = (plan: "pro" | "business") => {
    if (!offeringsLoaded) return "...";
    const pkg = billingPeriod === "monthly"
      ? (plan === "pro" ? packages.proMonthly      : packages.businessMonthly)
      : (plan === "pro" ? packages.proAnnual        : packages.businessAnnual);
    const fallback = billingPeriod === "annual"
      ? (plan === "pro" ? PLAN_LIMITS.pro.priceAnnual    : PLAN_LIMITS.business.priceAnnual)
      : (plan === "pro" ? PLAN_LIMITS.pro.priceMonthly   : PLAN_LIMITS.business.priceMonthly);
    return pkg?.priceString ?? fallback ?? "—";
  };

  const isPurchasing = (plan: "pro" | "business") =>
    purchasing === `${plan}_${billingPeriod}`;

  const isCurrentPlan = (plan: OrgPlan) => orgPlan === plan;

  //////////////////////////////////////////////////////
  // STYLES
  //////////////////////////////////////////////////////

  const styles = useMemo(() => StyleSheet.create({

    container: {
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 32,
      paddingBottom: 40
    },

    freeTrialCard: {
      width: "100%",
      backgroundColor: t.successSurface,
      borderWidth: 1.5,
      borderColor: t.success,
      borderRadius: 14,
      padding: 18,
      marginBottom: 20,
      alignItems: "center"
    },

    freeTrialTitle: {
      color: t.success,
      fontSize: 17,
      fontWeight: "700",
      marginBottom: 6,
      textAlign: "center"
    },

    freeTrialSub: {
      color: t.textSecondary,
      fontSize: 12,
      textAlign: "center",
      lineHeight: 18,
      marginBottom: 14
    },

    freeTrialBtn: {
      backgroundColor: t.success,
      paddingVertical: 13,
      paddingHorizontal: 28,
      borderRadius: 12,
      alignItems: "center",
      width: "100%"
    },

    trialBanner: {
      backgroundColor: t.warningSurface,
      borderWidth: 1,
      borderColor: t.warning,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 20,
      width: "100%"
    },

    trialText: {
      color: t.warning,
      fontSize: 13,
      textAlign: "center",
      fontWeight: "600"
    },

    badge: {
      backgroundColor: t.accent,
      paddingHorizontal: 14,
      paddingVertical: 4,
      borderRadius: 20,
      marginBottom: 14
    },

    badgeText: {
      color: t.accentText,
      fontWeight: "700",
      fontSize: 11,
      letterSpacing: 1.5
    },

    headline: {
      fontSize: 24,
      fontWeight: "700",
      color: t.text,
      textAlign: "center",
      marginBottom: 8
    },

    sub: {
      fontSize: 13,
      color: t.textSecondary,
      textAlign: "center",
      marginBottom: 20,
      lineHeight: 19
    },

    // BILLING TOGGLE
    toggle: {
      flexDirection: "row",
      backgroundColor: t.surface,
      borderRadius: 12,
      padding: 4,
      marginBottom: 24,
      width: "100%"
    },

    toggleBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 6
    },

    toggleBtnActive: {
      backgroundColor: t.accent
    },

    toggleText: {
      color: t.textSecondary,
      fontWeight: "600",
      fontSize: 14
    },

    toggleTextActive: {
      color: t.accentText
    },

    saveBadge: {
      backgroundColor: t.success,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2
    },

    saveText: {
      color: t.accentText,
      fontSize: 10,
      fontWeight: "700"
    },

    // CARDS
    card: {
      width: "100%",
      backgroundColor: t.surface,
      borderRadius: 16,
      padding: 18,
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: 16
    },

    proCard: {
      borderColor: t.accent,
      borderWidth: 2
    },

    businessCard: {
      borderColor: "#7C3AED",
      borderWidth: 2
    },

    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4
    },

    currentBadge: {
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 2
    },

    currentBadgeText: {
      color: t.accentText,
      fontSize: 10,
      fontWeight: "700"
    },

    planLabel: {
      color: t.textSecondary,
      fontSize: 13,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 1
    },

    price: {
      fontSize: 26,
      fontWeight: "700",
      color: t.text,
      marginTop: 4
    },

    priceNote: {
      fontSize: 11,
      color: t.textSecondary,
      marginBottom: 4
    },

    divider: {
      height: 1,
      backgroundColor: t.border,
      marginVertical: 12
    },

    featureRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 6,
      marginBottom: 6
    },

    check: {
      fontSize: 13,
      fontWeight: "700"
    },

    featureText: {
      color: t.text,
      fontSize: 12,
      flex: 1,
      lineHeight: 18
    },

    cta: {
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      marginTop: 14
    },

    ctaDisabled: {
      opacity: 0.6
    },

    ctaText: {
      color: t.accentText,
      fontWeight: "700",
      fontSize: 15
    },

    restoreBtn: {
      marginTop: 4,
      padding: 10
    },

    restoreText: {
      color: t.textSecondary,
      fontSize: 13,
      textAlign: "center",
      textDecorationLine: "underline"
    },

    legal: {
      fontSize: 11,
      color: t.textTertiary,
      textAlign: "center",
      marginTop: 12,
      lineHeight: 16
    }

  }), [t]);

  //////////////////////////////////////////////////////
  // EMPLOYEE GATE
  //////////////////////////////////////////////////////

  if (role === "employee") {
    return (
      <View style={styles.container}>
        <View style={styles.badge}>
          <ThemedText style={styles.badgeText}>UPGRADE REQUIRED</ThemedText>
        </View>
        <ThemedText style={styles.headline}>Pro Feature</ThemedText>
        <ThemedText style={styles.sub}>
          This feature requires a Pro or Business plan.{"\n"}
          Ask your organisation admin to upgrade.
        </ThemedText>
      </View>
    );
  }

  //////////////////////////////////////////////////////
  // MAIN UI
  //////////////////////////////////////////////////////

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >

      {/* FREE TRIAL CTA — shown once, for free plan orgs that haven't started a trial */}
      {orgPlan === "free" && !trialEndsAt && (
        <View style={styles.freeTrialCard}>
          <ThemedText style={styles.freeTrialTitle}>Try Business free for 7 days</ThemedText>
          <ThemedText style={styles.freeTrialSub}>
            No payment required. Get full Business-tier access — Xero/QBO/Sage exports, AI assistant, analytics, notifications, accounting codes, and 50 AI credits. Up to 25 claims during the trial.
          </ThemedText>
          {role === "admin" ? (
            <TouchableOpacity
              style={[styles.freeTrialBtn, startingTrial && styles.ctaDisabled]}
              onPress={handleStartTrial}
              disabled={startingTrial}
            >
              {startingTrial
                ? <ActivityIndicator color={t.accentText} />
                : <ThemedText style={styles.ctaText}>Start 7-Day Free Trial</ThemedText>
              }
            </TouchableOpacity>
          ) : (
            <ThemedText style={styles.freeTrialSub}>
              Ask your organisation admin to start the free trial.
            </ThemedText>
          )}
        </View>
      )}

      {/* TRIAL BANNER */}
      {orgPlan === "trial" && (
        <View style={styles.trialBanner}>
          <ThemedText style={styles.trialText}>
            {trialDaysLeft > 0
              ? `Trial ends in ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} — upgrade to keep access`
              : "Your trial has expired — upgrade to restore access"}
          </ThemedText>
        </View>
      )}

      {/* HEADER */}
      <ThemedText style={styles.headline}>Choose your plan</ThemedText>
      <ThemedText style={styles.sub}>
        Your whole organisation gets access when you upgrade.
      </ThemedText>

      {/* BILLING PERIOD TOGGLE */}
      <View style={styles.toggle}>
        <TouchableOpacity
          style={[styles.toggleBtn, billingPeriod === "monthly" && styles.toggleBtnActive]}
          onPress={() => setBillingPeriod("monthly")}
        >
          <ThemedText style={[styles.toggleText, billingPeriod === "monthly" && styles.toggleTextActive]}>
            Monthly
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleBtn, billingPeriod === "annual" && styles.toggleBtnActive]}
          onPress={() => setBillingPeriod("annual")}
        >
          <ThemedText style={[styles.toggleText, billingPeriod === "annual" && styles.toggleTextActive]}>
            Yearly
          </ThemedText>
          <View style={styles.saveBadge}>
            <ThemedText style={styles.saveText}>Save 20%</ThemedText>
          </View>
        </TouchableOpacity>
      </View>

      {/* FREE CARD */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <ThemedText style={styles.planLabel}>Free</ThemedText>
          {orgPlan === "free" && <CurrentBadge styles={styles} t={t} />}
        </View>
        <ThemedText style={styles.price}>£0</ThemedText>
        <ThemedText style={styles.priceNote}>forever</ThemedText>
        <Divider styles={styles} />
        {FEATURES_FREE.map(f => <FeatureRow key={f} text={f} color={t.textSecondary} styles={styles} />)}
      </View>

      {/* PRO CARD */}
      <View style={[styles.card, styles.proCard]}>
        <View style={styles.cardHeader}>
          <ThemedText style={[styles.planLabel, { color: t.accent }]}>Pro</ThemedText>
          {(orgPlan === "pro" || (orgPlan === "trial" && isPro)) && (
            <CurrentBadge color={t.accent} label={orgPlan === "trial" ? "Trial" : "Current"} styles={styles} t={t} />
          )}
        </View>

        <PriceDisplay
          priceString={getPriceLabel("pro")}
          period={billingPeriod}
          color={t.accent}
          loading={!offeringsLoaded}
          styles={styles}
        />

        <Divider styles={styles} />
        {FEATURES_PRO.map(f => <FeatureRow key={f} text={f} color={t.success} styles={styles} />)}

        {orgPlan !== "pro" && (
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: t.accent }, isPurchasing("pro") && styles.ctaDisabled]}
            onPress={() => handlePurchase("pro")}
            disabled={purchasing !== null}
          >
            {isPurchasing("pro")
              ? <ActivityIndicator color={t.accentText} />
              : <ThemedText style={styles.ctaText}>
                  {orgPlan === "business" ? "Switch to Pro" : "Subscribe to Pro"}
                </ThemedText>
            }
          </TouchableOpacity>
        )}
      </View>

      {/* BUSINESS CARD */}
      <View style={[styles.card, styles.businessCard]}>
        <View style={styles.cardHeader}>
          <ThemedText style={[styles.planLabel, { color: "#A78BFA" }]}>Business</ThemedText>
          {isCurrentPlan("business") && <CurrentBadge color="#7C3AED" styles={styles} t={t} />}
        </View>

        <PriceDisplay
          priceString={getPriceLabel("business")}
          period={billingPeriod}
          color="#A78BFA"
          loading={!offeringsLoaded}
          styles={styles}
        />

        <Divider styles={styles} />
        {FEATURES_BUSINESS.map(f => <FeatureRow key={f} text={f} color="#A78BFA" styles={styles} />)}

        {orgPlan !== "business" && (
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: "#7C3AED" }, isPurchasing("business") && styles.ctaDisabled]}
            onPress={() => handlePurchase("business")}
            disabled={purchasing !== null}
          >
            {isPurchasing("business")
              ? <ActivityIndicator color={t.accentText} />
              : <ThemedText style={styles.ctaText}>Subscribe to Business</ThemedText>
            }
          </TouchableOpacity>
        )}
      </View>

      {/* RESTORE */}
      {role === "admin" && Platform.OS !== "web" && !isExpoGo && (
        <TouchableOpacity onPress={handleRestore} disabled={restoring} style={styles.restoreBtn}>
          {restoring
            ? <ActivityIndicator color={t.textSecondary} size="small" />
            : <ThemedText style={styles.restoreText}>Restore Purchases</ThemedText>
          }
        </TouchableOpacity>
      )}

      <ThemedText style={styles.legal}>
        Subscriptions auto-renew. Cancel anytime in App Store / Play Store settings.
      </ThemedText>

    </ScrollView>
  );
}

//////////////////////////////////////////////////////
// SUB-COMPONENTS
//////////////////////////////////////////////////////

function PriceDisplay({
  priceString,
  period,
  color,
  loading,
  styles
}: {
  priceString: string;
  period: BillingPeriod;
  color: string;
  loading: boolean;
  styles: any;
}) {
  if (loading) return <ActivityIndicator color={color} style={{ marginVertical: 8 }} />;
  return (
    <>
      <ThemedText style={[styles.price, { color }]}>{priceString}</ThemedText>
      <ThemedText style={styles.priceNote}>
        {period === "annual" ? "billed annually" : "billed monthly"}
      </ThemedText>
    </>
  );
}

function FeatureRow({ text, color, styles }: { text: string; color: string; styles: any }) {
  return (
    <View style={styles.featureRow}>
      <ThemedText style={[styles.check, { color }]}>✓</ThemedText>
      <ThemedText style={styles.featureText}>{text}</ThemedText>
    </View>
  );
}

function CurrentBadge({ color, label = "Current", styles, t }: { color?: string; label?: string; styles: any; t: any }) {
  const badgeColor = color ?? t.border;
  return (
    <View style={[styles.currentBadge, { backgroundColor: badgeColor }]}>
      <ThemedText style={styles.currentBadgeText}>{label}</ThemedText>
    </View>
  );
}

function Divider({ styles }: { styles: any }) {
  return <View style={styles.divider} />;
}
