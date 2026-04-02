import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../hooks/useTheme";

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
  const { tokens: t } = useTheme();

  const styles = useMemo(() => StyleSheet.create({

    safe: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 16,
    },

    /* Hero */
    hero: {
      alignItems: "center",
    },
    logoOuter: {
      width: 68,
      height: 68,
      borderRadius: 20,
      backgroundColor: t.accentSurface,
      borderWidth: 1.5,
      borderColor: t.accentSurface,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 14,
      shadowColor: t.accent,
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 }
    },
    brandName: {
      color: t.text,
      fontSize: 34,
      fontWeight: "800",
      letterSpacing: -0.5,
      marginBottom: 8,
      textAlign: "center"
    },
    tagline: {
      color: t.accent,
      fontSize: 16,
      fontWeight: "700",
      textAlign: "center",
      lineHeight: 23,
      marginBottom: 10
    },
    description: {
      color: t.textSecondary,
      fontSize: 13,
      textAlign: "center",
      lineHeight: 20,
      maxWidth: 300
    },

    /* Features */
    featuresSection: {},
    featuresHeading: {
      color: t.textSecondary,
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
      backgroundColor: t.surface,
      borderRadius: 14,
      padding: 13,
      borderWidth: 1,
      borderColor: t.border
    },
    featureIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: t.accentSurface,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 9
    },
    featureTitle: {
      color: t.text,
      fontSize: 12,
      fontWeight: "700",
      marginBottom: 4,
      lineHeight: 17
    },
    featureDesc: {
      color: t.textSecondary,
      fontSize: 11,
      lineHeight: 16
    },

    /* Trust badges */
    trustRow: {
      flexDirection: "row",
      justifyContent: "center",
      flexWrap: "wrap",
      gap: 8
    },
    trustBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.bg,
      borderWidth: 1,
      borderColor: t.accentSurface,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 5
    },
    trustLabel: {
      color: t.textSecondary,
      fontSize: 11,
      fontWeight: "500"
    },

    /* CTA */
    ctaSection: {
      alignItems: "center"
    },
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.accent,
      borderRadius: 15,
      paddingVertical: 15,
      width: "100%",
      marginBottom: 10,
      shadowColor: t.accent,
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
      borderColor: t.border,
      alignItems: "center",
      marginBottom: 12
    },
    secondaryBtnText: {
      color: t.textSecondary,
      fontSize: 15,
      fontWeight: "600"
    },
    legalNote: {
      color: t.border,
      fontSize: 11,
      textAlign: "center"
    }

  }), [t]);

  return (
    <LinearGradient colors={[t.bg, t.surface]} style={{ flex: 1 }}>
      <SafeAreaView style={[styles.safe, { paddingBottom: 0 }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, justifyContent: "space-between", paddingBottom: 24 }}
        >

        {/* HERO */}
        <View style={styles.hero}>
          <View style={styles.logoOuter}>
            <Ionicons name="receipt-outline" size={28} color={t.accent} />
          </View>
          <Text style={styles.brandName}>Claimio</Text>
          <Text style={styles.tagline}>
            Smart expense management{"\n"}for modern teams
          </Text>
          <Text style={styles.description}>
            From receipt capture to reimbursement — Claimio automates your entire expense workflow with AI.
          </Text>
        </View>

        {/* FEATURES */}
        <View style={styles.featuresSection}>
          <Text style={styles.featuresHeading}>Everything you need</Text>
          <View style={styles.featuresGrid}>
            {FEATURES.map((f) => (
              <View key={f.title} style={styles.featureCard}>
                <View style={styles.featureIconWrap}>
                  <Ionicons name={f.icon} size={18} color={t.accent} />
                </View>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* TRUST BADGES */}
        <View style={styles.trustRow}>
          {TRUST.map((trust) => (
            <View key={trust.label} style={styles.trustBadge}>
              <Ionicons name={trust.icon} size={12} color={t.accent} style={{ marginRight: 4 }} />
              <Text style={styles.trustLabel}>{trust.label}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
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

        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}
