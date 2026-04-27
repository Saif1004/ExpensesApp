import { useRouter } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedText } from "./themed-text";
import { useTheme } from "../hooks/useTheme";

type Plan = "pro" | "business";

const PLAN_LABELS: Record<Plan, string> = {
  pro:      "Pro",
  business: "Business",
};

const PLAN_COLORS: Record<Plan, string> = {
  pro:      "#6366F1",
  business: "#7C3AED",
};

type Props = {
  requiredPlan: Plan;
  feature: string;
  description: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
};

// shown when a user tries to access a screen that requires a higher plan
export default function UpgradeGate({ requiredPlan, feature, description, icon = "lock-closed-outline" }: Props) {
  const { tokens: t } = useTheme();
  const router = useRouter();
  const color = PLAN_COLORS[requiredPlan];
  const label = PLAN_LABELS[requiredPlan];

  const styles = useMemo(() => StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: t.bg,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 32,
    },
    iconWrap: {
      width: 80,
      height: 80,
      borderRadius: 24,
      backgroundColor: color + "22",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 24,
      borderWidth: 1,
      borderColor: color + "44",
    },
    badge: {
      backgroundColor: color,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 4,
      marginBottom: 16,
    },
    badgeText: {
      color: "#fff",
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.2,
    },
    title: {
      color: t.text,
      fontSize: 22,
      fontWeight: "800",
      textAlign: "center",
      marginBottom: 10,
      letterSpacing: -0.5,
    },
    description: {
      color: t.textSecondary,
      fontSize: 14,
      lineHeight: 22,
      textAlign: "center",
      marginBottom: 32,
    },
    upgradeBtn: {
      backgroundColor: color,
      borderRadius: 14,
      paddingVertical: 15,
      paddingHorizontal: 32,
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      marginBottom: 14,
    },
    upgradeBtnText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "700",
    },
    backBtn: {
      paddingVertical: 12,
      paddingHorizontal: 20,
    },
    backBtnText: {
      color: t.textSecondary,
      fontSize: 14,
    },
  }), [t, color]);

  return (
    <View style={styles.root}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={36} color={color} />
      </View>
      <View style={styles.badge}>
        <ThemedText style={styles.badgeText}>{label.toUpperCase()} PLAN</ThemedText>
      </View>
      <ThemedText style={styles.title}>{feature}</ThemedText>
      <ThemedText style={styles.description}>{description}</ThemedText>
      <TouchableOpacity style={styles.upgradeBtn} onPress={() => router.push("/plans")} activeOpacity={0.85}>
        <Ionicons name="flash" size={18} color="#fff" />
        <ThemedText style={styles.upgradeBtnText}>Upgrade to {label}</ThemedText>
      </TouchableOpacity>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
        <ThemedText style={styles.backBtnText}>Go back</ThemedText>
      </TouchableOpacity>
    </View>
  );
}
