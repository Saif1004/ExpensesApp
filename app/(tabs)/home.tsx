import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View
} from "react-native";
import { ThemedText } from "../../components/themed-text";
import { Ionicons } from "@expo/vector-icons";

import { router } from "expo-router";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthProvider";
import { db } from "../firebase/firebaseConfig";
import { addListener } from "../../utils/listenerStore";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Claim = {
  id: string;
  merchant: string;
  amount: number;
  category: string;
  status: string;
  paymentStatus?: string;
};

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  pending:  { color: "#F59E0B", bg: "#1C1208", icon: "time-outline" },
  approved: { color: "#22C55E", bg: "#052E16", icon: "checkmark-circle-outline" },
  rejected: { color: "#EF4444", bg: "#2D0A0A", icon: "close-circle-outline" }
};

export default function HomeScreen() {

  const { user, refreshMembership, orgPlan, trialDaysLeft, role } = useAuth();
  const insets = useSafeAreaInsets();

  const [monthlySpend, setMonthlySpend] = useState(0);
  const [pending,      setPending]      = useState(0);
  const [approved,     setApproved]     = useState(0);
  const [recent,       setRecent]       = useState<Claim[]>([]);

  // Force refresh role on load
  useEffect(() => {
    if (user) refreshMembership();
  }, [user]);

  // Greeting
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";

  // Firestore listeners
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "claims"), where("userId", "==", user.uid));

    const unsub = addListener(onSnapshot(q, (snapshot) => {
      let spend = 0, pendingCount = 0, approvedCount = 0;
      snapshot.docs.forEach(doc => {
        const c = doc.data() as Claim;
        spend += Number(c.amount) || 0;
        if (c.status === "pending")  pendingCount++;
        if (c.status === "approved") approvedCount++;
      });
      setMonthlySpend(spend);
      setPending(pendingCount);
      setApproved(approvedCount);
    }, () => {}));

    const recentQ = query(
      collection(db, "claims"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(4)
    );

    const unsubRecent = addListener(onSnapshot(recentQ, (snapshot) => {
      setRecent(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Claim));
    }, () => {}));

    return () => { unsub(); unsubRecent(); };
  }, [user]);

  const monthlyLimit = 2000;
  const progress     = Math.min((monthlySpend / monthlyLimit) * 100, 100);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── HEADER ── */}
        <View style={styles.headerRow}>
          <View>
            <ThemedText style={styles.greeting}>Good {greeting} 👋</ThemedText>
            <ThemedText style={styles.subheading}>Here's your expense overview</ThemedText>
          </View>
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => router.push("/profile")}
            activeOpacity={0.8}
          >
            <Ionicons name="person" size={18} color="#38BDF8" />
          </TouchableOpacity>
        </View>

        {/* ── TRIAL BANNER ── */}
        {orgPlan === "trial" && (
          <TouchableOpacity
            style={styles.trialBanner}
            onPress={() => router.push("/plans")}
            activeOpacity={0.8}
          >
            <Ionicons name="time-outline" size={16} color="#F59E0B" style={{ marginRight: 8 }} />
            <ThemedText style={styles.trialText}>
              {trialDaysLeft > 0
                ? `Trial ends in ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} — tap to upgrade`
                : "Trial expired — tap to upgrade"}
            </ThemedText>
            <Ionicons name="chevron-forward" size={14} color="#F59E0B" />
          </TouchableOpacity>
        )}

        {/* ── SPENDING CARD ── */}
        <View style={styles.spendingCard}>
          <View style={styles.spendingTop}>
            <View>
              <ThemedText style={styles.spendingLabel}>Total Spending</ThemedText>
              <ThemedText style={styles.spendingAmount}>
                £{monthlySpend.toFixed(2)}
              </ThemedText>
            </View>
            <View style={styles.spendingBadge}>
              <Ionicons name="trending-up-outline" size={16} color="#60A5FA" />
              <ThemedText style={styles.spendingBadgeText}>All time</ThemedText>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
          </View>
          <View style={styles.progressLabels}>
            <ThemedText style={styles.progressNote}>£{monthlySpend.toFixed(2)} of £{monthlyLimit} budget</ThemedText>
            <ThemedText style={styles.progressNote}>{Math.round(progress)}%</ThemedText>
          </View>
        </View>

        {/* ── STAT CARDS ── */}
        <View style={styles.statsRow}>
          <StatCard
            label="Pending"
            value={pending}
            icon="time-outline"
            color="#F59E0B"
            bg="#1C1208"
          />
          <StatCard
            label="Approved"
            value={approved}
            icon="checkmark-circle-outline"
            color="#22C55E"
            bg="#052E16"
          />
        </View>

        {/* ── QUICK ACTIONS ── */}
        <ThemedText style={styles.sectionTitle}>Quick Actions</ThemedText>
        <View style={styles.actionsGrid}>
          <ActionBtn
            icon="add-circle-outline"
            label="New Claim"
            color="#2563EB"
            bg="#0D1F3C"
            onPress={() => router.push("/add-expense")}
          />
          <ActionBtn
            icon="document-text-outline"
            label="My Claims"
            color="#7C3AED"
            bg="#1A0D3C"
            onPress={() => router.push("/claims")}
          />
          <ActionBtn
            icon="bar-chart-outline"
            label="Analytics"
            color="#0891B2"
            bg="#0A1F2E"
            onPress={() => router.push("/Analytics")}
          />
          {role === "admin" && (
            <ActionBtn
              icon="people-outline"
              label="Admin Panel"
              color="#F59E0B"
              bg="#1C1208"
              onPress={() => router.push("/admin")}
            />
          )}
        </View>

        {/* ── RECENT ACTIVITY ── */}
        <View style={styles.recentHeader}>
          <ThemedText style={styles.sectionTitle}>Recent Activity</ThemedText>
          <TouchableOpacity onPress={() => router.push("/claims")} activeOpacity={0.7}>
            <ThemedText style={styles.viewAllLink}>View all</ThemedText>
          </TouchableOpacity>
        </View>

        {recent.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="receipt-outline" size={32} color="#334155" />
            </View>
            <ThemedText style={styles.emptyTitle}>No claims yet</ThemedText>
            <ThemedText style={styles.emptySubtitle}>
              Submit your first expense claim to get started
            </ThemedText>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push("/add-expense")}
              activeOpacity={0.85}
            >
              <ThemedText style={styles.emptyBtnText}>Add Expense</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          recent.map((claim) => (
            <RecentClaimCard
              key={claim.id}
              claim={claim}
              onPress={() => router.push(`/claims/${claim.id}`)}
            />
          ))
        )}

      </ScrollView>
    </View>
  );
}

//////////////////////////////////////////////////////
// SUB-COMPONENTS
//////////////////////////////////////////////////////

function StatCard({
  label, value, icon, color, bg
}: {
  label: string;
  value: number;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  bg: string;
}) {
  return (
    <View style={[styles.statCard, { borderColor: color + "33" }]}>
      <View style={[styles.statIconWrap, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <ThemedText style={[styles.statValue, { color }]}>{value}</ThemedText>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
    </View>
  );
}

function ActionBtn({
  icon, label, color, bg, onPress
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  color: string;
  bg: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, { borderColor: color + "33" }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.actionIconWrap, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <ThemedText style={styles.actionLabel}>{label}</ThemedText>
    </TouchableOpacity>
  );
}

function RecentClaimCard({
  claim, onPress
}: {
  claim: Claim;
  onPress: () => void;
}) {
  const cfg = STATUS_CONFIG[claim.status] ?? STATUS_CONFIG.pending;
  return (
    <TouchableOpacity style={styles.recentCard} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.recentStatusDot, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.icon} size={18} color={cfg.color} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.recentMerchant}>{claim.merchant}</ThemedText>
        <ThemedText style={styles.recentMeta}>
          {claim.category}
          {claim.paymentStatus === "paid" ? " · Paid" : ""}
        </ThemedText>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <ThemedText style={styles.recentAmount}>£{Number(claim.amount).toFixed(2)}</ThemedText>
        <View style={[styles.statusPill, { backgroundColor: cfg.bg }]}>
          <ThemedText style={[styles.statusPillText, { color: cfg.color }]}>
            {claim.status.charAt(0).toUpperCase() + claim.status.slice(1)}
          </ThemedText>
        </View>
      </View>
    </TouchableOpacity>
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

  container: {
    paddingHorizontal: 20,
    paddingTop: 16
  },

  /* Header */
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16
  },

  greeting: {
    color: "#F8FAFC",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 2
  },

  subheading: {
    color: "#475569",
    fontSize: 13
  },

  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    justifyContent: "center",
    alignItems: "center"
  },

  /* Trial banner */
  trialBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1C1208",
    borderWidth: 1,
    borderColor: "#F59E0B55",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16
  },

  trialText: {
    flex: 1,
    color: "#FCD34D",
    fontSize: 13,
    fontWeight: "600"
  },

  /* Spending card */
  spendingCard: {
    backgroundColor: "#1E293B",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155"
  },

  spendingTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16
  },

  spendingLabel: {
    color: "#64748B",
    fontSize: 12,
    marginBottom: 4
  },

  spendingAmount: {
    fontSize: 34,
    fontWeight: "800",
    color: "#60A5FA",
    fontVariant: ["tabular-nums"]
  },

  spendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D1F3C",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4
  },

  spendingBadgeText: {
    color: "#60A5FA",
    fontSize: 11,
    fontWeight: "600"
  },

  progressTrack: {
    height: 6,
    backgroundColor: "#334155",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 6
  },

  progressFill: {
    height: "100%",
    backgroundColor: "#2563EB",
    borderRadius: 4
  },

  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between"
  },

  progressNote: {
    color: "#475569",
    fontSize: 11
  },

  /* Stats */
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24
  },

  statCard: {
    flex: 1,
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    alignItems: "flex-start"
  },

  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10
  },

  statValue: {
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 2
  },

  statLabel: {
    color: "#64748B",
    fontSize: 12
  },

  /* Quick actions */
  sectionTitle: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 12
  },

  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 24
  },

  actionBtn: {
    width: "47%",
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },

  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center"
  },

  actionLabel: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "600",
    flex: 1
  },

  /* Recent */
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },

  viewAllLink: {
    color: "#38BDF8",
    fontSize: 13,
    fontWeight: "600"
  },

  recentCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 12
  },

  recentStatusDot: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center"
  },

  recentMerchant: {
    color: "#F8FAFC",
    fontWeight: "600",
    fontSize: 14,
    marginBottom: 2
  },

  recentMeta: {
    color: "#64748B",
    fontSize: 12
  },

  recentAmount: {
    color: "#60A5FA",
    fontWeight: "700",
    fontSize: 15,
    marginBottom: 4
  },

  statusPill: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2
  },

  statusPillText: {
    fontSize: 10,
    fontWeight: "700"
  },

  /* Empty state */
  emptyState: {
    alignItems: "center",
    paddingVertical: 40
  },

  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "#1E293B",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155"
  },

  emptyTitle: {
    color: "#94A3B8",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 6
  },

  emptySubtitle: {
    color: "#475569",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 20,
    maxWidth: 220
  },

  emptyBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24
  },

  emptyBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14
  }

});
