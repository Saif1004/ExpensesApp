import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { ThemedText } from "../../components/themed-text";

import { router } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import { useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../hooks/useTheme";
import { addListener } from "../../utils/listenerStore";
import { useAuth } from "../context/AuthProvider";
import { db } from "../firebase/firebaseConfig";

type Claim = {
  id: string;
  merchant: string;
  amount: number;
  category: string;
  status: string;
  paymentStatus?: string;
};

const BUDGET_PRESETS = [500, 1000, 2000, 3000, 5000, 10000];
const DEFAULT_BUDGET  = 2000;

export default function HomeScreen() {

  const { user, refreshMembership, orgPlan, trialDaysLeft, role } = useAuth();
  const insets = useSafeAreaInsets();
  const { tokens: t, mode } = useTheme();

  const [username,     setUsername]     = useState("");
  const [monthlySpend, setMonthlySpend] = useState(0);
  const [pending,      setPending]      = useState(0);
  const [approved,     setApproved]     = useState(0);
  const [recent,       setRecent]       = useState<Claim[]>([]);

  // Budget
  const [monthlyBudget,    setMonthlyBudget]    = useState(DEFAULT_BUDGET);
  const [adminBudgetLimit, setAdminBudgetLimit]  = useState<number | null>(null);
  const [budgetModalOpen,  setBudgetModalOpen]   = useState(false);
  const [customInput,      setCustomInput]       = useState("");
  const [selectedPreset,   setSelectedPreset]    = useState<number | null>(null);
  const [saving,           setSaving]            = useState(false);
  const customInputRef = useRef<TextInput>(null);

  // Force refresh role on load
  useEffect(() => {
    if (user) refreshMembership();
  }, [user]);

  // Load saved budget + admin override + username
  useEffect(() => {
    if (!user) return;

    getDoc(doc(db, "users", user.uid)).then((snap) => {
      const data = snap.data();
      if (data?.monthlyBudget && typeof data.monthlyBudget === "number") {
        setMonthlyBudget(data.monthlyBudget);
      }
      if (data?.username) setUsername(data.username);
    }).catch(() => {});

    getDocs(query(collection(db, "memberships"), where("userId", "==", user.uid)))
      .then((snap) => {
        if (!snap.empty) {
          const m = snap.docs[0].data();
          setAdminBudgetLimit(typeof m.budgetLimit === "number" && m.budgetLimit > 0 ? m.budgetLimit : null);
        }
      }).catch(() => {});
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

  const effectiveBudget = adminBudgetLimit ?? monthlyBudget;
  const progress        = Math.min((monthlySpend / effectiveBudget) * 100, 100);
  const progressColor   =
    progress >= 100 ? t.error :
    progress >= 80  ? t.warning :
                      t.accent;

  // ── Budget modal helpers ─────────────────────────────────────────

  function openBudgetModal() {
    if (adminBudgetLimit) {
      Alert.alert("Budget Locked", "Your admin has set a budget limit for you.");
      return;
    }
    const matchedPreset = BUDGET_PRESETS.includes(monthlyBudget) ? monthlyBudget : null;
    setSelectedPreset(matchedPreset);
    setCustomInput(matchedPreset ? "" : String(monthlyBudget));
    setBudgetModalOpen(true);
  }

  function closeBudgetModal() {
    setBudgetModalOpen(false);
    setCustomInput("");
    setSelectedPreset(null);
  }

  async function saveBudget() {
    let value: number;
    if (selectedPreset !== null) {
      value = selectedPreset;
    } else {
      value = parseInt(customInput.replace(/[^0-9]/g, ""), 10);
    }
    if (!value || value < 1 || value > 999999) {
      Alert.alert("Invalid budget", "Please enter a value between £1 and £999,999.");
      return;
    }
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), { monthlyBudget: value });
      setMonthlyBudget(value);
      closeBudgetModal();
    } catch {
      Alert.alert("Error", "Failed to save budget. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
    pending:  { color: t.warning, bg: t.warningSurface, icon: "time-outline" },
    approved: { color: t.success, bg: t.successSurface, icon: "checkmark-circle-outline" },
    rejected: { color: t.error, bg: t.errorSurface, icon: "close-circle-outline" }
  };

  const isDark = mode === "dark";

  const styles = useMemo(() => StyleSheet.create({

    root: { flex: 1, backgroundColor: t.bg },
    container: { paddingTop: 0 },   // insets.top already on root; extra pad added in headerRow

    /* ── Header ── */
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 16,     // spacing below the safe area (SafeAreaView owns the inset itself)
      marginBottom: 28,
    },
    greetingLabel: {
      color: t.textSecondary, fontSize: 13, fontWeight: "500", marginBottom: 2,
      includeFontPadding: false,
    },
    greeting: {
      color: t.text, fontSize: 30, fontWeight: "800", letterSpacing: -0.5,
      lineHeight: 44,            // extra room so Android heavy-font ascenders are never clipped
      includeFontPadding: false, // Android: strip internal glyph padding
    },
    avatarBtn: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: t.surface,
      justifyContent: "center", alignItems: "center",
    },

    /* ── Trial banner ── */
    trialBanner: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: t.warningSurface,
      borderRadius: t.radius.md, paddingHorizontal: 16, paddingVertical: 12,
      marginHorizontal: 24, marginBottom: 24,
      gap: 8,
    },
    trialText: { flex: 1, color: t.warning, fontSize: 13, fontWeight: "600" },

    /* ── Hero spending card ── */
    heroCard: {
      marginHorizontal: 24,
      marginBottom: 16,
      // No overflow:hidden here — it clips large text on Android
    },
    heroGradient: {
      padding: 22,
      borderRadius: t.radius.xl,   // radius lives on the gradient, not the wrapper
    },
    /* Row 1: label + right controls */
    heroTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    heroLabel: {
      color: isDark ? "rgba(255,255,255,0.5)" : t.textSecondary,
      fontSize: 11, fontWeight: "700",
      letterSpacing: 1.2, textTransform: "uppercase",
    },
    heroBadge: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: isDark ? "rgba(255,255,255,0.1)" : t.accentSurface,
      borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, gap: 4,
    },
    heroBadgeText: {
      color: isDark ? "rgba(255,255,255,0.7)" : t.accent,
      fontSize: 11, fontWeight: "600",
    },
    editBudgetBtn: {
      width: 30, height: 30, borderRadius: t.radius.sm,
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
      justifyContent: "center", alignItems: "center",
      marginLeft: 6,
    },
    /* Row 2: the big number — its own independent row */
    heroAmount: {
      fontSize: 42, fontWeight: "800", letterSpacing: -1.5,
      color: isDark ? "#FFFFFF" : t.text,
      fontVariant: ["tabular-nums"],
      lineHeight: 54,                // explicit line-height stops Android clipping
      includeFontPadding: false,     // Android: remove internal font padding
      marginBottom: 16,
    },
    /* Row 3: progress */
    progressTrack: {
      height: 4, backgroundColor: isDark ? "rgba(255,255,255,0.15)" : t.border,
      borderRadius: 2, overflow: "hidden", marginBottom: 8,
    },
    progressFill:   { height: "100%", borderRadius: 2 },
    progressLabels: { flexDirection: "row", justifyContent: "space-between" },
    progressNote: {
      color: isDark ? "rgba(255,255,255,0.45)" : t.textSecondary, fontSize: 12,
    },

    /* ── Stats ── */
    statsRow: { flexDirection: "row", gap: 12, marginHorizontal: 24, marginBottom: 28 },
    statCard: {
      flex: 1, backgroundColor: t.surface, borderRadius: t.radius.lg,
      padding: 16, alignItems: "flex-start",
    },
    statIconWrap: {
      width: 38, height: 38, borderRadius: 12,
      justifyContent: "center", alignItems: "center", marginBottom: 12,
      alignSelf: "flex-start",
    },
    statValue: { fontSize: 28, fontWeight: "800", marginBottom: 2 },
    statLabel: { color: t.textSecondary, fontSize: 12 },

    /* ── Quick actions (horizontal scroll) ── */
    actionsSection: { marginBottom: 32 },
    sectionHeader: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingHorizontal: 24, marginBottom: 16,
    },
    sectionTitle: { color: t.text, fontSize: 16, fontWeight: "700" },
    actionsScroll: { paddingLeft: 8, paddingRight: 8 },
    actionItem: { alignItems: "center", marginRight: 20 },
    actionCircle: {
      width: 60, height: 60, borderRadius: 30,
      backgroundColor: t.surface,
      justifyContent: "center", alignItems: "center",
      marginBottom: 8,
    },
    actionLabel: { color: t.textSecondary, fontSize: 11, fontWeight: "600", textAlign: "center" },

    /* ── Recent activity ── */
    recentSection: { paddingHorizontal: 24 },
    recentHeader:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
    viewAllLink:   { color: t.accent, fontSize: 14, fontWeight: "600" },

    recentCard: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: t.surface, borderRadius: t.radius.lg,
      padding: 16, marginBottom: 10, gap: 14,
    },
    recentIconWrap: {
      width: 44, height: 44, borderRadius: 14,
      justifyContent: "center", alignItems: "center",
    },
    recentMerchant: { color: t.text, fontWeight: "700", fontSize: 15, marginBottom: 3 },
    recentMeta:     { color: t.textSecondary, fontSize: 13 },
    recentAmount:   { color: t.text, fontWeight: "700", fontSize: 15, marginBottom: 4, textAlign: "right" },
    statusPill:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-end" },
    statusPillText: { fontSize: 10, fontWeight: "800" },

    /* ── Empty state ── */
    emptyState:    { alignItems: "center", paddingVertical: 48 },
    emptyIconWrap: {
      width: 80, height: 80, borderRadius: 24, backgroundColor: t.surface,
      justifyContent: "center", alignItems: "center", marginBottom: 20,
    },
    emptyTitle:    { color: t.textSecondary, fontSize: 17, fontWeight: "700", marginBottom: 6 },
    emptySubtitle: { color: t.textTertiary, fontSize: 14, textAlign: "center", marginBottom: 24, maxWidth: 220, lineHeight: 20 },
    emptyBtn:      { backgroundColor: t.accent, borderRadius: t.radius.md, paddingVertical: 14, paddingHorizontal: 28 },
    emptyBtnText:  { color: t.accentText, fontWeight: "700", fontSize: 15 },

    /* ── Budget modal ── */
    modalOverlay:  { flex: 1, justifyContent: "flex-end" },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.7)" },
    modalSheet: {
      backgroundColor: t.surface, borderTopLeftRadius: t.radius.xxl, borderTopRightRadius: t.radius.xxl,
      paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12,
    },
    sheetHandle: {
      width: 36, height: 4, backgroundColor: t.border,
      borderRadius: 2, alignSelf: "center", marginBottom: 24,
    },
    modalHeader:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
    modalTitle:    { color: t.text, fontSize: 20, fontWeight: "800" },
    modalSubtitle: { color: t.textSecondary, fontSize: 14, marginBottom: 24 },
    presetGrid:    { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
    presetChip: {
      paddingHorizontal: 18, paddingVertical: 12,
      backgroundColor: t.surfaceAlt, borderRadius: t.radius.md,
    },
    presetChipActive:     { backgroundColor: t.accent },
    presetChipText:       { color: t.textSecondary, fontSize: 14, fontWeight: "600" },
    presetChipTextActive: { color: t.accentText },
    customLabel: {
      color: t.textSecondary, fontSize: 12, fontWeight: "700",
      marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6,
    },
    customInputRow: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: t.surfaceAlt, borderRadius: t.radius.md, borderWidth: 1, borderColor: t.border,
      paddingHorizontal: 16, paddingVertical: 14, marginBottom: 24,
    },
    customInputRowActive: { borderColor: t.accent },
    currencySymbol: { color: t.accent, fontSize: 20, fontWeight: "700", marginRight: 8 },
    customInput:    { flex: 1, color: t.text, fontSize: 20, fontWeight: "700" },
    saveBtn:        { backgroundColor: t.accent, borderRadius: t.radius.md, paddingVertical: 16, alignItems: "center" },
    saveBtnText:    { color: t.accentText, fontSize: 16, fontWeight: "700" },

  }), [t, isDark]);

  // Hero card gradient colours
  const gradientColors: [string, string, string] = isDark
    ? ["#1A1040", "#0E0B22", "#080808"]
    : ["#EEF2FF", "#F0F4FF", "#FFFFFF"];

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── HEADER ── */}
        <View style={styles.headerRow}>
          <View>
            <ThemedText style={styles.greetingLabel}>Good {greeting} 👋</ThemedText>
            <ThemedText style={styles.greeting}>
              {username ? username.split(" ")[0] : "Dashboard"}
            </ThemedText>
          </View>
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => router.push("/profile")}
            activeOpacity={0.8}
          >
            <Ionicons name="person" size={20} color={t.accent} />
          </TouchableOpacity>
        </View>

        {/* ── TRIAL BANNER ── */}
        {orgPlan === "trial" && (
          <TouchableOpacity style={styles.trialBanner} onPress={() => router.push("/plans")} activeOpacity={0.8}>
            <Ionicons name="time-outline" size={16} color={t.warning} />
            <ThemedText style={styles.trialText}>
              {trialDaysLeft > 0
                ? `Trial ends in ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} — tap to upgrade`
                : "Trial expired — tap to upgrade"}
            </ThemedText>
            <Ionicons name="chevron-forward" size={14} color={t.warning} />
          </TouchableOpacity>
        )}

        {/* ── HERO SPENDING CARD ── */}
        <View style={styles.heroCard}>
          <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroGradient}>

            {/* Row 1 — label + controls */}
            <View style={styles.heroTopRow}>
              <ThemedText style={styles.heroLabel}>Total Spending</ThemedText>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={styles.heroBadge}>
                  <Ionicons name="trending-up-outline" size={13} color={isDark ? "rgba(255,255,255,0.7)" : t.accent} />
                  <ThemedText style={styles.heroBadgeText}>All time</ThemedText>
                </View>
                <TouchableOpacity style={styles.editBudgetBtn} onPress={openBudgetModal} activeOpacity={0.75}>
                  <Ionicons
                    name={adminBudgetLimit ? "lock-closed-outline" : "pencil-outline"}
                    size={13}
                    color={adminBudgetLimit ? t.warning : (isDark ? "rgba(255,255,255,0.6)" : t.textSecondary)}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Row 2 — big number, fully independent */}
            <ThemedText style={styles.heroAmount}>
              £{monthlySpend.toFixed(2)}
            </ThemedText>

            {/* Row 3 — progress */}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` as any, backgroundColor: progressColor }]} />
            </View>
            <View style={styles.progressLabels}>
              <ThemedText style={styles.progressNote}>
                £{monthlySpend.toFixed(2)} of £{effectiveBudget.toLocaleString()} budget
                {adminBudgetLimit ? " 🔒" : ""}
              </ThemedText>
              <ThemedText style={[styles.progressNote, progress >= 80 && { color: progressColor }]}>
                {Math.round(progress)}%
              </ThemedText>
            </View>

          </LinearGradient>
        </View>

        {/* ── STAT CARDS ── */}
        <View style={styles.statsRow}>
          <StatCard label="Pending"  value={pending}  icon="time-outline"             color={t.warning} bg={t.warningSurface} />
          <StatCard label="Approved" value={approved} icon="checkmark-circle-outline" color={t.success} bg={t.successSurface} />
        </View>

        {/* ── QUICK ACTIONS (horizontal scroll, circular — bunq-style) ── */}
        <View style={styles.actionsSection}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Quick Actions</ThemedText>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionsScroll}>
            <ActionCircle icon="add-circle-outline"       label="New Claim"  color={t.accent}   bg={t.accentSurface}   onPress={() => router.push("/add-expense")} />
            <ActionCircle icon="document-text-outline"    label="My Claims"  color="#7C3AED"    bg={t.accentSurface}   onPress={() => router.push("/claims")} />
            <ActionCircle icon="bar-chart-outline"        label="Analytics"  color="#0891B2"    bg={t.accentSurface}   onPress={() => router.push("/Analytics")} />
            <ActionCircle icon="chatbubble-ellipses-outline" label="AI Chat" color="#10B981"    bg={t.successSurface}  onPress={() => router.push("/chatbot")} />
            {role === "admin" && (
              <ActionCircle icon="people-outline" label="Admin" color={t.warning} bg={t.warningSurface} onPress={() => router.push("/admin")} />
            )}
          </ScrollView>
        </View>

        {/* ── RECENT ACTIVITY ── */}
        <View style={styles.recentSection}>
          <View style={styles.recentHeader}>
            <ThemedText style={styles.sectionTitle}>Recent Activity</ThemedText>
            <TouchableOpacity onPress={() => router.push("/claims")} activeOpacity={0.7}>
              <ThemedText style={styles.viewAllLink}>View all</ThemedText>
            </TouchableOpacity>
          </View>

          {recent.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="receipt-outline" size={34} color={t.textTertiary} />
              </View>
              <ThemedText style={styles.emptyTitle}>No claims yet</ThemedText>
              <ThemedText style={styles.emptySubtitle}>
                Submit your first expense claim to get started
              </ThemedText>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push("/add-expense")} activeOpacity={0.85}>
                <ThemedText style={styles.emptyBtnText}>Add Expense</ThemedText>
              </TouchableOpacity>
            </View>
          ) : (
            recent.map((claim) => (
              <RecentClaimCard
                key={claim.id}
                claim={claim}
                onPress={() => router.push(`/claims/${claim.id}`)}
                statusConfig={STATUS_CONFIG}
                styles={styles}
              />
            ))
          )}
        </View>

      </ScrollView>

      {/* ── BUDGET MODAL ── */}

      <Modal visible={budgetModalOpen} animationType="slide" transparent onRequestClose={closeBudgetModal}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeBudgetModal} />
          <View style={styles.modalSheet}>

            <View style={styles.sheetHandle} />

            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Set Budget</ThemedText>
              <TouchableOpacity onPress={closeBudgetModal} hitSlop={12}>
                <Ionicons name="close" size={22} color={t.textSecondary} />
              </TouchableOpacity>
            </View>
            <ThemedText style={styles.modalSubtitle}>Choose a preset or enter a custom budget</ThemedText>

            <View style={styles.presetGrid}>
              {BUDGET_PRESETS.map((preset) => {
                const active = selectedPreset === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.presetChip, active && styles.presetChipActive]}
                    onPress={() => { setSelectedPreset(preset); setCustomInput(""); }}
                    activeOpacity={0.75}
                  >
                    <ThemedText style={[styles.presetChipText, active && styles.presetChipTextActive]}>
                      £{preset >= 1000 ? `${preset / 1000}k` : preset}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>

            <ThemedText style={styles.customLabel}>Custom amount</ThemedText>
            <View style={[styles.customInputRow, customInput.length > 0 && selectedPreset === null && styles.customInputRowActive]}>
              <ThemedText style={styles.currencySymbol}>£</ThemedText>
              <TextInput
                ref={customInputRef}
                style={styles.customInput}
                placeholder="e.g. 4500"
                placeholderTextColor={t.textTertiary}
                keyboardType="number-pad"
                value={customInput}
                onChangeText={(val) => { setCustomInput(val.replace(/[^0-9]/g, "")); if (val.length > 0) setSelectedPreset(null); }}
                returnKeyType="done"
                onSubmitEditing={saveBudget}
              />
            </View>

            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={saveBudget} disabled={saving} activeOpacity={0.85}>
              <ThemedText style={styles.saveBtnText}>{saving ? "Saving…" : "Save Budget"}</ThemedText>
            </TouchableOpacity>

          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

//////////////////////////////////////////////////////
// SUB-COMPONENTS
//////////////////////////////////////////////////////

function StatCard({
  label,
  value,
  icon,
  color,
  bg,
}: {
  label: string;
  value: number;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  bg: string;
}) {
  const { tokens: t } = useTheme();

  return (
    <View style={{
      flex: 1, backgroundColor: t.surface,
      borderRadius: t.radius.lg, padding: 16,
      alignItems: "flex-start",
    }}>
      {/* Icon */}
      <View style={{
        width: 38, height: 38, borderRadius: 12,
        justifyContent: "center", alignItems: "center",
        backgroundColor: bg, marginBottom: 10, marginLeft: -11,
      }}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      {/* Number — includeFontPadding:false stops Android clipping the top of heavy digits */}
      <ThemedText style={{
        fontSize: 28, fontWeight: "800", color,
        lineHeight: 38,
        includeFontPadding: false,
        marginBottom: 2,
      }}>
        {value}
      </ThemedText>
      <ThemedText style={{ color: t.textSecondary, fontSize: 13 }}>
        {label}
      </ThemedText>
    </View>
  );
}

function ActionCircle({ icon, label, color, bg, onPress }: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string; color: string; bg: string; onPress: () => void;
}) {
  const { tokens: t } = useTheme();
  return (
    <TouchableOpacity
      style={{ alignItems: "center", marginRight: 20, width: 68 }}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={{
        width: 62, height: 62, borderRadius: 31,
        backgroundColor: t.surface,
        justifyContent: "center", alignItems: "center", marginBottom: 8,
      }}>
        <Ionicons name={icon} size={26} color={color} />
      </View>
      <ThemedText style={{
        color: t.textSecondary, fontSize: 11, fontWeight: "600",
        textAlign: "center", width: 68, lineHeight: 14,
      }} numberOfLines={1}>
        {label}
      </ThemedText>
    </TouchableOpacity>
  );
}

function RecentClaimCard({ claim, onPress, statusConfig, styles }: {
  claim: Claim;
  onPress: () => void;
  statusConfig: Record<string, { color: string; bg: string; icon: React.ComponentProps<typeof Ionicons>["name"] }>;
  styles: any;
}) {
  const cfg = statusConfig[claim.status] ?? statusConfig.pending;
  return (
    <TouchableOpacity style={styles.recentCard} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.recentIconWrap, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.icon} size={20} color={cfg.color} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.recentMerchant}>{claim.merchant}</ThemedText>
        <ThemedText style={styles.recentMeta}>
          {claim.category}{claim.paymentStatus === "paid" ? " · Paid" : ""}
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
