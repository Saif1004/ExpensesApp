import { doc, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
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
import { PLAN_LIMITS, OrgPlan } from "../constants/planLimits";
import { useAuth } from "../app/context/AuthProvider";
import { db } from "../app/firebase/firebaseConfig";
import { ThemedText } from "./themed-text";

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
  "View claim status updates",
  "Add receipts & photos",
  "Up to 5 employees"
];

const FEATURES_PRO = [
  "Everything in Free",
  "Analytics & spending charts",
  "AI expense assistant",
  "500 AI credits / month",
  "Up to 20 employees"
];

const FEATURES_BUSINESS = [
  "Everything in Pro",
  "2,000 AI credits / month",
  "Up to 100 employees",
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
    if (Platform.OS === "web" || isExpoGo) {
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

    if (Platform.OS === "web" || isExpoGo) {
      Alert.alert("Not available", "Subscriptions can only be purchased via the mobile app.");
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
      const { customerInfo } = await Purchases.purchasePackage(pkgInfo.pkg as any);

      const hasBusiness = !!customerInfo.entitlements.active[PLAN_LIMITS.business.rcEntitlement!];
      const hasPro      = !!customerInfo.entitlements.active[PLAN_LIMITS.pro.rcEntitlement!];
      const newPlan: OrgPlan = hasBusiness ? "business" : hasPro ? "pro" : targetPlan;

      await updateDoc(doc(db, "organisations", orgId), {
        plan: newPlan,
        aiCreditsRemaining: PLAN_LIMITS[newPlan].aiCreditsPerPeriod,
        aiCreditsResetAt:   new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });

      await refreshOrgPlan();
      Alert.alert("Subscribed!", `Welcome to ${PLAN_LIMITS[newPlan].label}! Your whole team now has access.`);
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
    if (!orgId) return;
    if (role !== "admin") {
      Alert.alert("Admin required", "Ask your organisation admin to start the trial.");
      return;
    }
    setStartingTrial(true);
    try {
      const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await updateDoc(doc(db, "organisations", orgId), {
        plan: "trial",
        trialEndsAt: trialEnd,
        aiCreditsRemaining: 50
      });
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
    if (!orgId || role !== "admin" || Platform.OS === "web" || isExpoGo) return;
    setRestoring(true);
    try {
      const Purchases = (await import("react-native-purchases")).default;
      const info = await Purchases.restorePurchases();

      const hasBusiness = !!info.entitlements.active[PLAN_LIMITS.business.rcEntitlement!];
      const hasPro      = !!info.entitlements.active[PLAN_LIMITS.pro.rcEntitlement!];

      if (hasBusiness || hasPro) {
        const newPlan: OrgPlan = hasBusiness ? "business" : "pro";
        await updateDoc(doc(db, "organisations", orgId), {
          plan: newPlan,
          aiCreditsRemaining: PLAN_LIMITS[newPlan].aiCreditsPerPeriod,
          aiCreditsResetAt:   new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        });
        await refreshOrgPlan();
        Alert.alert("Restored", `Your ${PLAN_LIMITS[newPlan].label} subscription has been restored.`);
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
    return pkg?.priceString ?? (plan === "pro" ? PLAN_LIMITS.pro.priceMonthly : PLAN_LIMITS.business.priceMonthly) ?? "—";
  };

  const isPurchasing = (plan: "pro" | "business") =>
    purchasing === `${plan}_${billingPeriod}`;

  const isCurrentPlan = (plan: OrgPlan) => orgPlan === plan;

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
      style={{ flex: 1, backgroundColor: "#0F172A" }}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >

      {/* FREE TRIAL CTA — shown once, for free plan orgs that haven't started a trial */}
      {orgPlan === "free" && !trialEndsAt && (
        <View style={styles.freeTrialCard}>
          <ThemedText style={styles.freeTrialTitle}>Try Pro free for 7 days</ThemedText>
          <ThemedText style={styles.freeTrialSub}>
            No payment required. Your whole organisation gets Analytics, AI assistant, and 50 AI credits during the trial.
          </ThemedText>
          {role === "admin" ? (
            <TouchableOpacity
              style={[styles.freeTrialBtn, startingTrial && styles.ctaDisabled]}
              onPress={handleStartTrial}
              disabled={startingTrial}
            >
              {startingTrial
                ? <ActivityIndicator color="#fff" />
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
          {orgPlan === "free" && <CurrentBadge />}
        </View>
        <ThemedText style={styles.price}>£0</ThemedText>
        <ThemedText style={styles.priceNote}>forever</ThemedText>
        <Divider />
        {FEATURES_FREE.map(f => <FeatureRow key={f} text={f} color="#64748B" />)}
      </View>

      {/* PRO CARD */}
      <View style={[styles.card, styles.proCard]}>
        <View style={styles.cardHeader}>
          <ThemedText style={[styles.planLabel, { color: "#60A5FA" }]}>Pro</ThemedText>
          {(orgPlan === "pro" || (orgPlan === "trial" && isPro)) && (
            <CurrentBadge color="#2563EB" label={orgPlan === "trial" ? "Trial" : "Current"} />
          )}
        </View>

        <PriceDisplay
          priceString={getPriceLabel("pro")}
          period={billingPeriod}
          color="#60A5FA"
          loading={!offeringsLoaded}
        />

        <Divider />
        {FEATURES_PRO.map(f => <FeatureRow key={f} text={f} color="#22C55E" />)}

        {orgPlan !== "pro" && (
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: "#2563EB" }, isPurchasing("pro") && styles.ctaDisabled]}
            onPress={() => handlePurchase("pro")}
            disabled={purchasing !== null}
          >
            {isPurchasing("pro")
              ? <ActivityIndicator color="#fff" />
              : <ThemedText style={styles.ctaText}>
                  {orgPlan === "business" ? "Switch to Pro" : "Start Free Trial"}
                </ThemedText>
            }
          </TouchableOpacity>
        )}
      </View>

      {/* BUSINESS CARD */}
      <View style={[styles.card, styles.businessCard]}>
        <View style={styles.cardHeader}>
          <ThemedText style={[styles.planLabel, { color: "#A78BFA" }]}>Business</ThemedText>
          {isCurrentPlan("business") && <CurrentBadge color="#7C3AED" />}
        </View>

        <PriceDisplay
          priceString={getPriceLabel("business")}
          period={billingPeriod}
          color="#A78BFA"
          loading={!offeringsLoaded}
        />

        <Divider />
        {FEATURES_BUSINESS.map(f => <FeatureRow key={f} text={f} color="#A78BFA" />)}

        {orgPlan !== "business" && (
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: "#7C3AED" }, isPurchasing("business") && styles.ctaDisabled]}
            onPress={() => handlePurchase("business")}
            disabled={purchasing !== null}
          >
            {isPurchasing("business")
              ? <ActivityIndicator color="#fff" />
              : <ThemedText style={styles.ctaText}>Start Free Trial</ThemedText>
            }
          </TouchableOpacity>
        )}
      </View>

      {/* RESTORE */}
      {role === "admin" && Platform.OS !== "web" && !isExpoGo && (
        <TouchableOpacity onPress={handleRestore} disabled={restoring} style={styles.restoreBtn}>
          {restoring
            ? <ActivityIndicator color="#64748B" size="small" />
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
  loading
}: {
  priceString: string;
  period: BillingPeriod;
  color: string;
  loading: boolean;
}) {
  if (loading) return <ActivityIndicator color={color} style={{ marginVertical: 8 }} />;
  return (
    <>
      <ThemedText style={[styles.price, { color }]}>{priceString}</ThemedText>
      <ThemedText style={styles.priceNote}>
        {period === "annual" ? "per year" : "per month"} · 7-day free trial
      </ThemedText>
    </>
  );
}

function FeatureRow({ text, color }: { text: string; color: string }) {
  return (
    <View style={styles.featureRow}>
      <ThemedText style={[styles.check, { color }]}>✓</ThemedText>
      <ThemedText style={styles.featureText}>{text}</ThemedText>
    </View>
  );
}

function CurrentBadge({ color = "#334155", label = "Current" }: { color?: string; label?: string }) {
  return (
    <View style={[styles.currentBadge, { backgroundColor: color }]}>
      <ThemedText style={styles.currentBadgeText}>{label}</ThemedText>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

//////////////////////////////////////////////////////
// STYLES
//////////////////////////////////////////////////////

const styles = StyleSheet.create({

  container: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 40
  },

  freeTrialCard: {
    width: "100%",
    backgroundColor: "#0F2A1A",
    borderWidth: 1.5,
    borderColor: "#22C55E",
    borderRadius: 14,
    padding: 18,
    marginBottom: 20,
    alignItems: "center"
  },

  freeTrialTitle: {
    color: "#22C55E",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 6,
    textAlign: "center"
  },

  freeTrialSub: {
    color: "#94A3B8",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 14
  },

  freeTrialBtn: {
    backgroundColor: "#16A34A",
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: 12,
    alignItems: "center",
    width: "100%"
  },

  trialBanner: {
    backgroundColor: "#F59E0B22",
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
    width: "100%"
  },

  trialText: {
    color: "#FCD34D",
    fontSize: 13,
    textAlign: "center",
    fontWeight: "600"
  },

  badge: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 14
  },

  badgeText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 1.5
  },

  headline: {
    fontSize: 24,
    fontWeight: "700",
    color: "#F8FAFC",
    textAlign: "center",
    marginBottom: 8
  },

  sub: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 19
  },

  // BILLING TOGGLE
  toggle: {
    flexDirection: "row",
    backgroundColor: "#1E293B",
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
    backgroundColor: "#2563EB"
  },

  toggleText: {
    color: "#64748B",
    fontWeight: "600",
    fontSize: 14
  },

  toggleTextActive: {
    color: "#fff"
  },

  saveBadge: {
    backgroundColor: "#22C55E",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2
  },

  saveText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700"
  },

  // CARDS
  card: {
    width: "100%",
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 16
  },

  proCard: {
    borderColor: "#2563EB",
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
    color: "#fff",
    fontSize: 10,
    fontWeight: "700"
  },

  planLabel: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1
  },

  price: {
    fontSize: 26,
    fontWeight: "700",
    color: "#F8FAFC",
    marginTop: 4
  },

  priceNote: {
    fontSize: 11,
    color: "#64748B",
    marginBottom: 4
  },

  divider: {
    height: 1,
    backgroundColor: "#334155",
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
    color: "#CBD5E1",
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
    color: "#fff",
    fontWeight: "700",
    fontSize: 15
  },

  restoreBtn: {
    marginTop: 4,
    padding: 10
  },

  restoreText: {
    color: "#64748B",
    fontSize: 13,
    textAlign: "center",
    textDecorationLine: "underline"
  },

  legal: {
    fontSize: 11,
    color: "#475569",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 16
  }

});
