import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, TouchableOpacity, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const FEATURES = [
  {
    icon: "scan-outline" as const,
    title: "AI Receipt Scanning",
    desc: "Snap a photo — AI extracts details instantly."
  },
  {
    icon: "flash-outline" as const,
    title: "Instant Reimbursements",
    desc: "Stripe-powered payouts to employee accounts."
  },
  {
    icon: "shield-checkmark-outline" as const,
    title: "Policy Enforcement",
    desc: "AI validates every claim before submission."
  },
  {
    icon: "bar-chart-outline" as const,
    title: "Spending Analytics",
    desc: "Real-time dashboards to keep budgets on track."
  }
];

const TRUST = [
  { icon: "lock-closed-outline" as const, label: "Bank-grade security" },
  { icon: "flash-outline"       as const, label: "Real-time sync" },
  { icon: "people-outline"      as const, label: "Teams of all sizes" },
];

export default function Landing() {
  const router = useRouter();

  return (
    <LinearGradient colors={["#020617", "#0F172A", "#1E293B"]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe}>

        {/* ── HERO ── */}
        <View style={styles.hero}>
          <View style={styles.logoOuter}>
            <Ionicons name="receipt-outline" size={28} color="#38BDF8" />
          </View>
          <Text style={styles.brandName}>Claimio</Text>
          <Text style={styles.tagline}>
            Smart expense management{"\n"}for modern teams
          </Text>
          <Text style={styles.description}>
            From receipt capture to reimbursement — Claimio automates your entire expense workflow with AI.
          </Text>
        </View>

        {/* ── FEATURES ── */}
        <View style={styles.featuresSection}>
          <Text style={styles.featuresHeading}>Everything you need</Text>
          <View style={styles.featuresGrid}>
            {FEATURES.map((f) => (
              <View key={f.title} style={styles.featureCard}>
                <View style={styles.featureIconWrap}>
                  <Ionicons name={f.icon} size={18} color="#38BDF8" />
                </View>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── TRUST BADGES ── */}
        <View style={styles.trustRow}>
          {TRUST.map((t) => (
            <View key={t.label} style={styles.trustBadge}>
              <Ionicons name={t.icon} size={12} color="#38BDF8" style={{ marginRight: 4 }} />
              <Text style={styles.trustLabel}>{t.label}</Text>
            </View>
          ))}
        </View>

        {/* ── CTA ── */}
        <View style={styles.ctaSection}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push("/sign-up")}
            activeOpacity={0.88}
          >
            <Text style={styles.primaryBtnText}>Get Started Free</Text>
            <Ionicons name="arrow-forward" size={17} color="#fff" style={{ marginLeft: 6 }} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push("/sign-in")}
            activeOpacity={0.75}
          >
            <Text style={styles.secondaryBtnText}>Sign In</Text>
          </TouchableOpacity>

          <Text style={styles.legalNote}>Free plan available · No credit card required</Text>
        </View>

      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({

  safe: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: "space-between",
    paddingTop: 16,
    paddingBottom: 8
  },

  /* ── Hero ── */
  hero: {
    alignItems: "center",
  },
  logoOuter: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: "#0F2A3D",
    borderWidth: 1.5,
    borderColor: "#1E4F6B",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
    shadowColor: "#38BDF8",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }
  },
  brandName: {
    color: "#F8FAFC",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: "center"
  },
  tagline: {
    color: "#38BDF8",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 23,
    marginBottom: 10
  },
  description: {
    color: "#64748B",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 300
  },

  /* ── Features ── */
  featuresSection: {},
  featuresHeading: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    textAlign: "center",
    marginBottom: 12
  },
  featuresGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  featureCard: {
    width: "48%",
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: "#334155"
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#0F2A3D",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 9
  },
  featureTitle: {
    color: "#F1F5F9",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
    lineHeight: 17
  },
  featureDesc: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16
  },

  /* ── Trust badges ── */
  trustRow: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8
  },
  trustBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  trustLabel: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "500"
  },

  /* ── CTA ── */
  ctaSection: {
    alignItems: "center"
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    borderRadius: 15,
    paddingVertical: 15,
    width: "100%",
    marginBottom: 10,
    shadowColor: "#2563EB",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700"
  },
  secondaryBtn: {
    borderRadius: 15,
    paddingVertical: 13,
    width: "100%",
    borderWidth: 1.5,
    borderColor: "#334155",
    alignItems: "center",
    marginBottom: 12
  },
  secondaryBtnText: {
    color: "#94A3B8",
    fontSize: 15,
    fontWeight: "600"
  },
  legalNote: {
    color: "#334155",
    fontSize: 11,
    textAlign: "center"
  }

});
