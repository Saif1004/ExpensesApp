import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where
} from "firebase/firestore";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { db } from "../firebase/firebaseConfig";
import { useAuth } from "../context/AuthProvider";
import { ThemedText } from "../../components/themed-text";
import { useTheme } from "../../hooks/useTheme";

const BUDGET_PRESETS = [500, 1000, 2000, 3000, 5000, 10000];

type UserItem = {
  membershipId: string;
  userId: string;
  displayName?: string;
  email?: string;
  role?: string;
  status?: string;
  budgetLimit?: number | null;
};

function getInitials(displayName?: string, email?: string): string {
  if (displayName && displayName.trim().length > 0) {
    const parts = displayName.trim().split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return displayName.trim()[0].toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return "?";
}

export default function AdminUsers() {

  const { employeeLimit, orgPlan, orgId, user, refreshMembership } = useAuth();
  const { tokens: t } = useTheme();

  const [users, setUsers]                   = useState<UserItem[]>([]);
  const [approvedCount, setApprovedCount]   = useState(0);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [tab, setTab]                       = useState<"pending" | "approved" | "rejected">("pending");
  const [pendingCount, setPendingCount]     = useState(0);
  const [searchQuery, setSearchQuery]       = useState("");

  // state for the budget override modal
  const [budgetUser,    setBudgetUser]    = useState<UserItem | null>(null);
  const [budgetPreset,  setBudgetPreset]  = useState<number | null>(null);
  const [budgetCustom,  setBudgetCustom]  = useState("");
  const [savingBudget,  setSavingBudget]  = useState(false);
  const customRef = useRef<TextInput>(null);

  // refresh role on mount so newly promoted admins get access right away
  useEffect(() => { refreshMembership(); }, []);

  // fetches the member list for the current tab

  const loadUsers = async (silent = false) => {
    try {
      if (!silent) setLoading(true);

      if (!user?.emailVerified || !orgId) {
        setUsers([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const q = query(
        collection(db, "memberships"),
        where("orgId",   "==", orgId),
        where("status",  "==", tab)
      );

      const snap = await getDocs(q);

      const list: UserItem[] = snap.docs.map((docSnap) => {
        const m = docSnap.data();
        return {
          membershipId: docSnap.id,
          userId:       m.userId,
          role:         m.role,
          status:       m.status,
          displayName:  m.displayName,
          email:        m.email,
          budgetLimit:  typeof m.budgetLimit === "number" ? m.budgetLimit : null,
        };
      });

      setUsers(list);

      // always keep the approved count current for the plan limit check
      if (tab === "approved") {
        setApprovedCount(list.length);
      } else {
        const approvedSnap = await getDocs(query(
          collection(db, "memberships"),
          where("orgId",  "==", orgId),
          where("status", "==", "approved")
        ));
        setApprovedCount(approvedSnap.size);
      }

    } catch (error) {
      console.log("LOAD USERS ERROR:", error);
      Alert.alert("Error", "Could not load users.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadPendingCount = async () => {
    try {
      if (!user?.emailVerified || !orgId) return;
      const snap = await getDocs(query(
        collection(db, "memberships"),
        where("orgId",  "==", orgId),
        where("status", "==", "pending")
      ));
      setPendingCount(snap.size);
    } catch (err) {
      console.log("COUNT ERROR:", err);
    }
  };

  useEffect(() => { loadPendingCount(); },           [orgId, user]);
  useEffect(() => { loadUsers(); },                  [tab, orgId, user]);

  const onRefresh = () => {
    setRefreshing(true);
    loadUsers(true);
    loadPendingCount();
  };

  // approve a pending member

  const approveUser = async (membershipId: string) => {
    try {
      if (approvedCount >= employeeLimit) {
        Alert.alert(
          "Employee limit reached",
          `Your ${orgPlan} plan allows up to ${employeeLimit} members. Upgrade your plan to add more.`
        );
        return;
      }
      await updateDoc(doc(db, "memberships", membershipId), { status: "approved" });

      // ping the employee with a notification — fire and forget
      const notifyUrl = process.env.EXPO_PUBLIC_NOTIFY_MEMBERSHIP_STATUS_URL;
      if (notifyUrl) {
        user?.getIdToken().then(token =>
          fetch(notifyUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ membershipId, status: 'approved' }),
          })
        ).catch(() => {});
      }

      loadUsers();
      loadPendingCount();
    } catch (error) {
      console.log("APPROVE ERROR:", error);
      Alert.alert("Error", "Could not approve user.");
    }
  };

  // reject a pending member

  const rejectUser = async (membershipId: string) => {
    try {
      await updateDoc(doc(db, "memberships", membershipId), { status: "rejected" });

      // same notification flow for rejection
      const notifyUrl = process.env.EXPO_PUBLIC_NOTIFY_MEMBERSHIP_STATUS_URL;
      if (notifyUrl) {
        user?.getIdToken().then(token =>
          fetch(notifyUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ membershipId, status: 'rejected' }),
          })
        ).catch(() => {});
      }

      loadUsers();
      loadPendingCount();
    } catch (error) {
      console.log("REJECT ERROR:", error);
      Alert.alert("Error", "Could not reject user.");
    }
  };

  // open/close/save the budget override modal

  const openBudgetModal = (u: UserItem) => {
    const current = u.budgetLimit ?? null;
    const matchedPreset = current && BUDGET_PRESETS.includes(current) ? current : null;
    setBudgetPreset(matchedPreset);
    setBudgetCustom(matchedPreset ? "" : current ? String(current) : "");
    setBudgetUser(u);
  };

  const closeBudgetModal = () => {
    setBudgetUser(null);
    setBudgetPreset(null);
    setBudgetCustom("");
  };

  const saveBudgetOverride = async () => {
    if (!budgetUser) return;

    let value: number | null = null;

    if (budgetPreset !== null) {
      value = budgetPreset;
    } else if (budgetCustom.trim()) {
      const parsed = parseInt(budgetCustom.replace(/[^0-9]/g, ""), 10);
      if (!parsed || parsed < 1 || parsed > 999999) {
        Alert.alert("Invalid amount", "Enter a budget between £1 and £999,999.");
        return;
      }
      value = parsed;
    }
    // null means "remove the cap entirely"

    setSavingBudget(true);
    try {
      await updateDoc(doc(db, "memberships", budgetUser.membershipId), {
        budgetLimit: value
      });
      closeBudgetModal();
      loadUsers(true);
    } catch {
      Alert.alert("Error", "Could not save budget override.");
    } finally {
      setSavingBudget(false);
    }
  };

  const removeBudgetOverride = async (u: UserItem) => {
    Alert.alert(
      "Remove Budget Limit",
      `Remove the budget limit for ${u.displayName || u.email || "this user"}? They can set their own budget.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "memberships", u.membershipId), { budgetLimit: null });
              loadUsers(true);
            } catch {
              Alert.alert("Error", "Could not remove budget limit.");
            }
          }
        }
      ]
    );
  };

  // filter the list by the search query

  const filteredUsers = users.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (u.displayName?.toLowerCase().includes(q) ?? false) ||
           (u.email?.toLowerCase().includes(q) ?? false);
  });

  // styles for the whole screen

  const styles = useMemo(() => StyleSheet.create({

    container: {
      flex: 1,
      backgroundColor: t.bg,
      paddingHorizontal: 20,
      paddingTop: 12
    },

    title: {
      color: t.text,
      fontSize: 30,
      fontWeight: "800",
      letterSpacing: -1,
      marginBottom: 6
    },

    limitRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 14
    },
    limitText:    { color: t.textSecondary, fontSize: 12 },
    limitWarning: { color: t.warning, fontSize: 11, fontWeight: "700" },

    // search bar
    searchWrapper: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.surface,
      borderRadius: 999,
      paddingHorizontal: 16,
      marginBottom: 16,
      height: 46
    },
    searchInput: { flex: 1, color: t.text, fontSize: 14 },

    // tab row
    tabs: { flexDirection: "row", marginBottom: 20, gap: 8 },
    tab: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: t.surface,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 6,
    },
    tabActive:     { backgroundColor: t.accent },
    tabText:       { color: t.textSecondary, fontWeight: "600", fontSize: 13 },
    tabTextActive: { color: "#FFFFFF", fontWeight: "700" },
    badge: {
      backgroundColor: t.error,
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 2
    },
    badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },

    // user cards
    card: {
      backgroundColor: t.surface,
      borderRadius: 20,
      marginBottom: 12,
      overflow: "hidden",
    },
    cardTop: {
      flexDirection: "row",
      alignItems: "center",
      padding: 14,
      gap: 12
    },

    // avatar/initials circle
    avatar: {
      width: 44, height: 44,
      borderRadius: 22,
      backgroundColor: t.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0
    },
    avatarText: { color: t.text, fontWeight: "700", fontSize: 16 },

    userInfo: { flex: 1 },
    name:  { color: t.text, fontSize: 15, fontWeight: "600" },
    email: { color: t.textSecondary, marginTop: 2, fontSize: 12 },

    // role pill badge
    roleBadge: {
      backgroundColor: t.accentSurface,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    roleBadgeAdmin: { backgroundColor: t.warningSurface },
    roleBadgeText: {
      color: t.accent,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "capitalize"
    },
    roleBadgeTextAdmin: { color: t.warning },

    // budget limit row
    budgetRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      paddingBottom: 12
    },
    budgetBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.warningSurface,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    budgetBadgeText: { color: t.warning, fontSize: 11, fontWeight: "600" },
    budgetEditBtn: {
      width: 28, height: 28,
      borderRadius: 999,
      backgroundColor: t.surfaceAlt,
      justifyContent: "center",
      alignItems: "center"
    },
    budgetRemoveBtn: {
      width: 28, height: 28,
      borderRadius: 999,
      backgroundColor: t.errorSurface,
      justifyContent: "center",
      alignItems: "center"
    },
    setBudgetBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.accentSurface,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    setBudgetText: { color: t.accent, fontSize: 12, fontWeight: "600" },

    // approve/reject buttons
    buttons: {
      flexDirection: "row",
      paddingHorizontal: 14,
      paddingBottom: 14,
      gap: 10
    },
    approveBtn: {
      flex: 1,
      backgroundColor: t.success,
      paddingVertical: 11,
      borderRadius: 999,
      alignItems: "center"
    },
    rejectBtn: {
      flex: 1,
      backgroundColor: t.errorSurface,
      paddingVertical: 11,
      borderRadius: 999,
      alignItems: "center",
    },
    approveBtnText: { color: "#fff",     fontWeight: "700", fontSize: 14 },
    rejectBtnText:  { color: t.error,    fontWeight: "700", fontSize: 14 },

    // empty state
    emptyState: { alignItems: "center", marginTop: 60, gap: 10 },
    emptyIcon:  { fontSize: 36 },
    empty:      { color: t.textSecondary, textAlign: "center", fontSize: 14 },

    // budget override modal
    modalOverlay:  { flex: 1, justifyContent: "flex-end" },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
    modalSheet: {
      backgroundColor: t.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 24,
      paddingBottom: 40,
      paddingTop: 12,
    },
    sheetHandle: {
      width: 40, height: 4,
      backgroundColor: t.border,
      borderRadius: 2,
      alignSelf: "center",
      marginBottom: 20
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6
    },
    modalTitle:    { color: t.text, fontSize: 18, fontWeight: "700" },
    modalSubtitle: { color: t.textSecondary, fontSize: 13, marginBottom: 20 },
    presetGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 20
    },
    presetChip: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      backgroundColor: t.surfaceAlt,
      borderRadius: 999,
    },
    presetChipActive:     { backgroundColor: t.accent },
    presetChipText:       { color: t.textSecondary, fontSize: 14, fontWeight: "600" },
    presetChipTextActive: { color: "#FFFFFF", fontWeight: "700" },
    customLabel: {
      color: t.textSecondary,
      fontSize: 12,
      fontWeight: "600",
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.6
    },
    customInputRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.surfaceAlt,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: 16
    },
    customInputRowActive: { borderColor: t.accent },
    currencySymbol: { color: t.accent, fontSize: 18, fontWeight: "700", marginRight: 6 },
    customInput:    { flex: 1, color: t.text, fontSize: 18, fontWeight: "600" },
    removeOverrideBtn: {
      flex: 1,
      backgroundColor: t.surfaceAlt,
      borderRadius: 999,
      paddingVertical: 15,
      alignItems: "center",
    },
    removeOverrideBtnText: { color: t.textSecondary, fontSize: 15, fontWeight: "700" },
    saveBtn: {
      backgroundColor: t.accent,
      borderRadius: 999,
      paddingVertical: 15,
      alignItems: "center"
    },
    saveBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" }

  }), [t]);

  // renders a single tab button with optional badge

  const TabButton = (name: "pending" | "approved" | "rejected", label: string) => (
    <TouchableOpacity
      style={[styles.tab, tab === name && styles.tabActive]}
      onPress={() => { setTab(name); if (name === "pending") setPendingCount(0); }}
    >
      <Text style={[styles.tabText, tab === name && styles.tabTextActive]}>{label}</Text>
      {name === "pending" && pendingCount > 0 && (
        <View style={styles.badge}><Text style={styles.badgeText}>{pendingCount}</Text></View>
      )}
    </TouchableOpacity>
  );

  // the screen layout

  return (
    <SafeAreaView style={styles.container}>

      <Text style={styles.title}>Team</Text>

      <View style={styles.limitRow}>
        <Text style={styles.limitText}>Members: {approvedCount} / {employeeLimit}</Text>
        {approvedCount >= employeeLimit && <Text style={styles.limitWarning}>Limit reached</Text>}
      </View>

      {/* search */}
      <View style={styles.searchWrapper}>
        <Ionicons name="search-outline" size={15} color={t.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email..."
          placeholderTextColor={t.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <View style={styles.tabs}>
        {TabButton("pending",  "Pending")}
        {TabButton("approved", "Approved")}
        {TabButton("rejected", "Rejected")}
      </View>

      {loading ? (
        <ActivityIndicator color={t.accent} size="large" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={t.accent}
              colors={[t.accent]}
            />
          }
        >
          {filteredUsers.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>{searchQuery.trim() ? "🔍" : "👤"}</Text>
              <Text style={styles.empty}>
                {searchQuery.trim() ? `No results for "${searchQuery}"` : `No ${tab} users`}
              </Text>
            </View>
          ) : (
            filteredUsers.map((u) => (
              <View key={u.membershipId} style={styles.card}>

                <View style={styles.cardTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{getInitials(u.displayName, u.email)}</Text>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.name}>{u.displayName || "Unknown"}</Text>
                    <Text style={styles.email}>{u.email || "No email"}</Text>
                  </View>
                  <View style={[styles.roleBadge, u.role === "admin" && styles.roleBadgeAdmin]}>
                    <Text style={[styles.roleBadgeText, u.role === "admin" && styles.roleBadgeTextAdmin]}>
                      {u.role || "employee"}
                    </Text>
                  </View>
                </View>

                {/* budget limit display for approved users */}
                {tab === "approved" && (
                  <View style={styles.budgetRow}>
                    {u.budgetLimit ? (
                      <>
                        <View style={styles.budgetBadge}>
                          <Ionicons name="lock-closed-outline" size={11} color={t.warning} style={{ marginRight: 4 }} />
                          <Text style={styles.budgetBadgeText}>Budget: £{u.budgetLimit.toLocaleString()}</Text>
                        </View>
                        <TouchableOpacity style={styles.budgetEditBtn} onPress={() => openBudgetModal(u)}>
                          <Ionicons name="pencil-outline" size={13} color={t.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.budgetRemoveBtn} onPress={() => removeBudgetOverride(u)}>
                          <Ionicons name="close-circle-outline" size={13} color={t.error} />
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity style={styles.setBudgetBtn} onPress={() => openBudgetModal(u)} activeOpacity={0.8}>
                        <Ionicons name="wallet-outline" size={13} color={t.accent} style={{ marginRight: 4 }} />
                        <Text style={styles.setBudgetText}>Set Budget Limit</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {tab === "pending" && (
                  <View style={styles.buttons}>
                    <TouchableOpacity style={styles.approveBtn} onPress={() => approveUser(u.membershipId)}>
                      <Text style={styles.approveBtnText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.rejectBtn} onPress={() => rejectUser(u.membershipId)}>
                      <Text style={styles.rejectBtnText}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                )}

              </View>
            ))
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* budget override modal */}
      <Modal visible={!!budgetUser} animationType="slide" transparent onRequestClose={closeBudgetModal}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeBudgetModal} />
          <View style={styles.modalSheet}>

            <View style={styles.sheetHandle} />

            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Set Budget Limit</ThemedText>
              <TouchableOpacity onPress={closeBudgetModal} hitSlop={12}>
                <Ionicons name="close" size={22} color={t.textSecondary} />
              </TouchableOpacity>
            </View>

            <ThemedText style={styles.modalSubtitle}>
              Override the spending budget for {budgetUser?.displayName || budgetUser?.email || "this user"}.
              Leave blank to remove the limit.
            </ThemedText>

            {/* preset budget amounts */}
            <View style={styles.presetGrid}>
              {BUDGET_PRESETS.map((p) => {
                const active = budgetPreset === p;
                return (
                  <TouchableOpacity
                    key={p}
                    style={[styles.presetChip, active && styles.presetChipActive]}
                    onPress={() => { setBudgetPreset(p); setBudgetCustom(""); }}
                    activeOpacity={0.75}
                  >
                    <ThemedText style={[styles.presetChipText, active && styles.presetChipTextActive]}>
                      £{p >= 1000 ? `${p / 1000}k` : p}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* custom amount input */}
            <ThemedText style={styles.customLabel}>Custom amount</ThemedText>
            <View style={[
              styles.customInputRow,
              budgetCustom.length > 0 && budgetPreset === null && styles.customInputRowActive
            ]}>
              <ThemedText style={styles.currencySymbol}>£</ThemedText>
              <TextInput
                ref={customRef}
                style={styles.customInput}
                placeholder="e.g. 1500"
                placeholderTextColor={t.textTertiary}
                keyboardType="number-pad"
                value={budgetCustom}
                onChangeText={(txt) => { setBudgetCustom(txt.replace(/[^0-9]/g, "")); if (txt.length > 0) setBudgetPreset(null); }}
                returnKeyType="done"
                onSubmitEditing={saveBudgetOverride}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={[styles.removeOverrideBtn]}
                onPress={() => { setBudgetPreset(null); setBudgetCustom(""); }}
                activeOpacity={0.8}
              >
                <ThemedText style={styles.removeOverrideBtnText}>Clear Limit</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { flex: 2 }, savingBudget && { opacity: 0.6 }]}
                onPress={saveBudgetOverride}
                disabled={savingBudget}
                activeOpacity={0.85}
              >
                <ThemedText style={styles.saveBtnText}>{savingBudget ? "Saving…" : "Save"}</ThemedText>
              </TouchableOpacity>
            </View>

          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}
