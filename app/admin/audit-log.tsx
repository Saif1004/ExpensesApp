import {
  collection,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";
import UpgradeGate from "../../components/upgrade-gate";
import { useAuth } from "../context/AuthProvider";
import { db } from "../firebase/firebaseConfig";
import { addListener } from "../../utils/listenerStore";
import { onSnapshot } from "firebase/firestore";
import { useTheme } from "../../hooks/useTheme";

type AuditEntry = {
  id: string;
  orgId: string;
  claimId: string;
  action: "approved" | "rejected" | "pending_l2" | string;
  actor: string;
  actorId: string | null;
  amount: number;
  merchant: string;
  userEmail: string;
  adminFeedback: string | null;
  timestamp?: { toDate?: () => Date; seconds?: number } | null;
};

function formatTimestamp(ts: AuditEntry["timestamp"]): string {
  if (!ts) return "—";
  const d = ts.toDate?.() ?? (ts.seconds ? new Date(ts.seconds * 1000) : null);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actionIcon(action: string): { name: React.ComponentProps<typeof Ionicons>["name"]; color: string } {
  if (action === "approved") return { name: "checkmark-circle", color: "#16a34a" };
  if (action === "rejected") return { name: "close-circle", color: "#dc2626" };
  return { name: "arrow-up-circle", color: "#7C3AED" };
}

function actionLabel(action: string): string {
  if (action === "approved") return "Approved";
  if (action === "rejected") return "Rejected";
  if (action === "pending_l2") return "Escalated";
  return action;
}

export default function AuditLogScreen() {
  const { orgId, isBusiness } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tokens: t, mode } = useTheme();
  const isDark = mode === "dark";

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isBusiness || !orgId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "auditLog"),
      where("orgId", "==", orgId),
      orderBy("timestamp", "desc"),
      limit(100)
    );

    const unsub = addListener(
      onSnapshot(
        q,
        (snapshot) => {
          const data: AuditEntry[] = snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<AuditEntry, "id">),
          }));
          setEntries(data);
          setLoading(false);
        },
        () => { setLoading(false); }
      )
    );

    return unsub;
  }, [orgId, isBusiness]);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.bg,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingBottom: 14,
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 999,
      backgroundColor: t.surfaceAlt,
      justifyContent: "center",
      alignItems: "center",
    },
    title: {
      fontSize: 20,
      fontWeight: "800",
      color: t.text,
      letterSpacing: -0.5,
      flex: 1,
    },
    list: {
      paddingHorizontal: 20,
      paddingTop: 14,
    },
    card: {
      backgroundColor: t.surface,
      borderRadius: 16,
      marginBottom: 12,
      padding: 16,
      ...(isDark ? {} : {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
        elevation: 2,
      }),
    },
    cardTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 8,
    },
    actionLabel: {
      fontSize: 13,
      fontWeight: "700",
    },
    amount: {
      fontSize: 18,
      fontWeight: "800",
      color: t.text,
      letterSpacing: -0.5,
      flex: 1,
      textAlign: "right",
    },
    merchant: {
      fontSize: 14,
      fontWeight: "600",
      color: t.text,
      marginBottom: 4,
    },
    metaRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 2,
    },
    metaLabel: {
      color: t.textTertiary,
      fontSize: 11,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    metaValue: {
      color: t.textSecondary,
      fontSize: 12,
      flexShrink: 1,
      textAlign: "right",
      maxWidth: "60%",
    },
    timestamp: {
      color: t.textTertiary,
      fontSize: 11,
      marginTop: 8,
    },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      paddingTop: 80,
    },
    emptyText: {
      color: t.textTertiary,
      fontSize: 14,
    },
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
  }), [t, isDark]);

  if (!isBusiness) {
    return (
      <UpgradeGate
        requiredPlan="business"
        feature="Audit Trail"
        description="Full audit trail of every claim action — required for compliance and HMRC reporting."
      />
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={18} color={t.text} />
        </TouchableOpacity>
        <ThemedText style={styles.title}>Audit Log</ThemedText>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={t.accent} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 24 },
            entries.length === 0 && { flex: 1 },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={36} color={t.border} />
              <ThemedText style={styles.emptyText}>No audit log entries yet</ThemedText>
            </View>
          }
          renderItem={({ item }) => {
            const icon = actionIcon(item.action);
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <Ionicons name={icon.name} size={20} color={icon.color} />
                  <ThemedText style={[styles.actionLabel, { color: icon.color }]}>
                    {actionLabel(item.action)}
                  </ThemedText>
                  <ThemedText style={styles.amount}>
                    £{Number(item.amount).toFixed(2)}
                  </ThemedText>
                </View>

                <ThemedText style={styles.merchant}>{item.merchant}</ThemedText>

                <View style={styles.metaRow}>
                  <ThemedText style={styles.metaLabel}>Employee</ThemedText>
                  <ThemedText style={styles.metaValue}>{item.userEmail}</ThemedText>
                </View>
                <View style={styles.metaRow}>
                  <ThemedText style={styles.metaLabel}>Actioned by</ThemedText>
                  <ThemedText style={styles.metaValue}>{item.actor}</ThemedText>
                </View>
                {item.adminFeedback ? (
                  <View style={styles.metaRow}>
                    <ThemedText style={styles.metaLabel}>Note</ThemedText>
                    <ThemedText style={styles.metaValue}>{item.adminFeedback}</ThemedText>
                  </View>
                ) : null}

                <ThemedText style={styles.timestamp}>
                  {formatTimestamp(item.timestamp)}
                </ThemedText>
              </View>
            );
          }}
        />
      )}
    </ThemedView>
  );
}
