import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "react-native";

const { width } = Dimensions.get("window");

const FEATURES = [
  {
    icon: "scan-outline" as const,
    title: "AI Receipt Scanning",
    desc: "Snap a photo — our AI extracts merchant, amount and date instantly."
  },
  {
    icon: "flash-outline" as const,
    title: "Instant Reimbursements",
    desc: "Stripe-powered payouts sent directly to employee bank accounts."
  },
  {
    icon: "shield-checkmark-outline" as const,
    title: "Policy Enforcement",
    desc: "Set spending rules and let AI validate every claim before it's submitted."
  },
  {
    icon: "bar-chart-outline" as const,
    title: "Spending Analytics",
    desc: "Real-time dashboards and AI insights to keep budgets on track."
  }
];

export default function Landing() {
  const router = useRouter();

  return (
    <LinearGradient
      colors={["#020617", "#0F172A", "#1E293B"]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          bounces
        >

          {/* ── HERO ── */}
          <View style={styles.hero}>

            {/* Logo */}
            <View style={styles.logoWrap}>
              <View style={styles.logoOuter}>
                <Ionicons name="receipt-outline" size={32} color="#38BDF8" />
              </View>
            </View>

            <Text style={styles.brandName}>Claimio</Text>
            <Text style={styles.tagline}>
              Smart expense management{"\n"}for modern teams
            </Text>
            <Text style={styles.description}>
              From receipt capture to reimbursement — Claimio automates your entire expense workflow with AI.
            </Text>

          </View>

          {/* ── FEATURE CARDS ── */}
          <View style={styles.featuresSection}>

            <Text style={styles.featuresHeading}>Everything you need</Text>

            <View style={styles.featuresGrid}>
              {FEATURES.map((f) => (
                <View key={f.title} style={styles.featureCard}>
                  <View style={styles.featureIconWrap}>
                    <Ionicons name={f.icon} size={22} color="#38BDF8" />
                  </View>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureDesc}>{f.desc}</Text>
                </View>
              ))}
            </View>

          </View>

          {/* ── TRUST BADGES ── */}
          <View style={styles.trustRow}>
            <TrustBadge icon="lock-closed-outline" label="Bank-grade security" />
            <TrustBadge icon="flash-outline"       label="Real-time sync" />
            <TrustBadge icon="people-outline"      label="Teams of all sizes" />
          </View>

          {/* ── CTA BUTTONS ── */}
          <View style={styles.ctaSection}>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push("/sign-up")}
              activeOpacity={0.88}
            >
              <Text style={styles.primaryBtnText}>Get Started Free</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.push("/sign-in")}
              activeOpacity={0.75}
            >
              <Text style={styles.secondaryBtnText}>Sign In</Text>
            </TouchableOpacity>

            <Text style={styles.legalNote}>
              Free plan available · No credit card required
            </Text>

          </View>

        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function TrustBadge({
  icon,
  label
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
}) {
  return (
    <View style={styles.trustBadge}>
      <Ionicons name={icon} size={14} color="#38BDF8" style={{ marginRight: 5 }} />
      <Text style={styles.trustLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({

  scroll: {
    paddingBottom: 48
  },

  /* ── Hero ── */
  hero: {
    alignItems: "center",
    paddingHorizontal: 28,
    paddingTop: 40,
    paddingBottom: 36
  },

  logoWrap: {
    marginBottom: 24
  },

  logoOuter: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: "#0F2A3D",
    borderWidth: 1.5,
    borderColor: "#1E4F6B",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#38BDF8",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 }
  },

  brandName: {
    color: "#F8FAFC",
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 12,
    textAlign: "center"
  },

  tagline: {
    color: "#38BDF8",
    fontSize: 19,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 27,
    marginBottom: 16
  },

  description: {
    color: "#64748B",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 23,
    maxWidth: 320
  },

  /* ── Features ── */
  featuresSection: {
    paddingHorizontal: 20,
    marginBottom: 24
  },

  featuresHeading: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    textAlign: "center",
    marginBottom: 18
  },

  featuresGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },

  featureCard: {
    width: (width - 52) / 2,
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#334155"
  },

  featureIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#0F2A3D",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12
  },

  featureTitle: {
    color: "#F1F5F9",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
    lineHeight: 18
  },

  featureDesc: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 17
  },

  /* ── Trust badges ── */
  trustRow: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 32
  },

  trustBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6
  },

  trustLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "500"
  },

  /* ── CTA ── */
  ctaSection: {
    paddingHorizontal: 24,
    alignItems: "center"
  },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    borderRadius: 16,
    paddingVertical: 16,
    width: "100%",
    marginBottom: 12,
    shadowColor: "#2563EB",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }
  },

  primaryBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700"
  },

  secondaryBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    width: "100%",
    borderWidth: 1.5,
    borderColor: "#334155",
    alignItems: "center",
    marginBottom: 16
  },

  secondaryBtnText: {
    color: "#94A3B8",
    fontSize: 16,
    fontWeight: "600"
  },

  legalNote: {
    color: "#334155",
    fontSize: 12,
    textAlign: "center"
  }

});
