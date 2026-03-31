import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where
} from "firebase/firestore";

import { useEffect, useRef, useState } from "react";
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

  const [users, setUsers]                   = useState<UserItem[]>([]);
  const [approvedCount, setApprovedCount]   = useState(0);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [tab, setTab]                       = useState<"pending" | "approved" | "rejected">("pending");
  const [pendingCount, setPendingCount]     = useState(0);
  const [searchQuery, setSearchQuery]       = useState("");

  // Budget override modal state
  const [budgetUser,    setBudgetUser]    = useState<UserItem | null>(null);
  const [budgetPreset,  setBudgetPreset]  = useState<number | null>(null);
  const [budgetCustom,  setBudgetCustom]  = useState("");
  const [savingBudget,  setSavingBudget]  = useState(false);
  const customRef = useRef<TextInput>(null);

  // Refresh membership on mount so promoted admins work immediately
  useEffect(() => { refreshMembership(); }, []);

  //////////////////////////////////////////////////////
  // LOAD USERS
  //////////////////////////////////////////////////////

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

      // Keep approved count fresh
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

  //////////////////////////////////////////////////////
  // APPROVE
  //////////////////////////////////////////////////////

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
      loadUsers();
      loadPendingCount();
    } catch (error) {
      console.log("APPROVE ERROR:", error);
      Alert.alert("Error", "Could not approve user.");
    }
  };

  //////////////////////////////////////////////////////
  // REJECT
  //////////////////////////////////////////////////////

  const rejectUser = async (membershipId: string) => {
    try {
      await updateDoc(doc(db, "memberships", membershipId), { status: "rejected" });
      loadUsers();
      loadPendingCount();
    } catch (error) {
      console.log("REJECT ERROR:", error);
      Alert.alert("Error", "Could not reject user.");
    }
  };

  //////////////////////////////////////////////////////
  // BUDGET OVERRIDE
  //////////////////////////////////////////////////////

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
    // value === null means "remove override"

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

  //////////////////////////////////////////////////////
  // FILTERED USERS
  //////////////////////////////////////////////////////

  const filteredUsers = users.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (u.displayName?.toLowerCase().includes(q) ?? false) ||
           (u.email?.toLowerCase().includes(q) ?? false);
  });

  //////////////////////////////////////////////////////
  // TAB BUTTON
  //////////////////////////////////////////////////////

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

  //////////////////////////////////////////////////////
  // UI
  //////////////////////////////////////////////////////

  return (
    <SafeAreaView style={styles.container}>

      <Text style={styles.title}>Team</Text>

      <View style={styles.limitRow}>
        <Text style={styles.limitText}>Members: {approvedCount} / {employeeLimit}</Text>
        {approvedCount >= employeeLimit && <Text style={styles.limitWarning}>Limit reached</Text>}
      </View>

      {/* Search bar */}
      <View style={styles.searchWrapper}>
        <Ionicons name="search-outline" size={15} color="#64748B" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email..."
          placeholderTextColor="#475569"
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
        <ActivityIndicator color="#38BDF8" size="large" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#38BDF8"
              colors={["#38BDF8"]}
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

                {/* Budget limit badge (approved tab) */}
                {tab === "approved" && (
                  <View style={styles.budgetRow}>
                    {u.budgetLimit ? (
                      <>
                        <View style={styles.budgetBadge}>
                          <Ionicons name="lock-closed-outline" size={11} color="#F59E0B" style={{ marginRight: 4 }} />
                          <Text style={styles.budgetBadgeText}>Budget: £{u.budgetLimit.toLocaleString()}</Text>
                        </View>
                        <TouchableOpacity style={styles.budgetEditBtn} onPress={() => openBudgetModal(u)}>
                          <Ionicons name="pencil-outline" size={13} color="#94A3B8" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.budgetRemoveBtn} onPress={() => removeBudgetOverride(u)}>
                          <Ionicons name="close-circle-outline" size={13} color="#EF4444" />
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity style={styles.setBudgetBtn} onPress={() => openBudgetModal(u)} activeOpacity={0.8}>
                        <Ionicons name="wallet-outline" size={13} color="#60A5FA" style={{ marginRight: 4 }} />
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

      {/* ── BUDGET OVERRIDE MODAL ── */}
      <Modal visible={!!budgetUser} animationType="slide" transparent onRequestClose={closeBudgetModal}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeBudgetModal} />
          <View style={styles.modalSheet}>

            <View style={styles.sheetHandle} />

            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Set Budget Limit</ThemedText>
              <TouchableOpacity onPress={closeBudgetModal} hitSlop={12}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ThemedText style={styles.modalSubtitle}>
              Override the spending budget for {budgetUser?.displayName || budgetUser?.email || "this user"}.
              Leave blank to remove the limit.
            </ThemedText>

            {/* Presets */}
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

            {/* Custom */}
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
                placeholderTextColor="#475569"
                keyboardType="number-pad"
                value={budgetCustom}
                onChangeText={(t) => { setBudgetCustom(t.replace(/[^0-9]/g, "")); if (t.length > 0) setBudgetPreset(null); }}
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

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#0F172A",
    paddingHorizontal: 20,
    paddingTop: 12
  },

  title: {
    color: "#F8FAFC",
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 6
  },

  limitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14
  },
  limitText:    { color: "#64748B", fontSize: 12 },
  limitWarning: { color: "#F97316", fontSize: 11, fontWeight: "700" },

  /* Search */
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 12,
    marginBottom: 16,
    height: 44
  },
  searchInput: { flex: 1, color: "#F8FAFC", fontSize: 14 },

  /* Tabs */
  tabs: { flexDirection: "row", marginBottom: 20, gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#1E293B",
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#334155"
  },
  tabActive:     { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  tabText:       { color: "#94A3B8", fontWeight: "600", fontSize: 13 },
  tabTextActive: { color: "#fff" },
  badge: {
    backgroundColor: "#DC2626",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },

  /* Cards */
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 14,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#334155"
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12
  },

  /* Avatar */
  avatar: {
    width: 44, height: 44,
    borderRadius: 22,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0
  },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  userInfo: { flex: 1 },
  name:  { color: "#F8FAFC", fontSize: 15, fontWeight: "600" },
  email: { color: "#94A3B8", marginTop: 2, fontSize: 12 },

  /* Role badge */
  roleBadge: {
    backgroundColor: "#0F172A",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#38BDF8"
  },
  roleBadgeAdmin: { borderColor: "#F59E0B" },
  roleBadgeText: {
    color: "#38BDF8",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize"
  },
  roleBadgeTextAdmin: { color: "#F59E0B" },

  /* Budget row */
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
    backgroundColor: "#292524",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#78350F"
  },
  budgetBadgeText: { color: "#FCD34D", fontSize: 11, fontWeight: "600" },
  budgetEditBtn: {
    width: 28, height: 28,
    borderRadius: 7,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    justifyContent: "center",
    alignItems: "center"
  },
  budgetRemoveBtn: {
    width: 28, height: 28,
    borderRadius: 7,
    backgroundColor: "#2D0A0A",
    borderWidth: 1,
    borderColor: "#7F1D1D",
    justifyContent: "center",
    alignItems: "center"
  },
  setBudgetBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D1F3C",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#2563EB55"
  },
  setBudgetText: { color: "#60A5FA", fontSize: 12, fontWeight: "600" },

  /* Action buttons */
  buttons: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10
  },
  approveBtn: {
    flex: 1,
    backgroundColor: "#2563EB",
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center"
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: "transparent",
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#DC2626"
  },
  approveBtnText: { color: "#fff",     fontWeight: "700", fontSize: 14 },
  rejectBtnText:  { color: "#DC2626",  fontWeight: "700", fontSize: 14 },

  /* Empty state */
  emptyState: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyIcon:  { fontSize: 36 },
  empty:      { color: "#94A3B8", textAlign: "center", fontSize: 14 },

  /* Budget modal */
  modalOverlay:  { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  modalSheet: {
    backgroundColor: "#1E293B",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: "#334155"
  },
  sheetHandle: {
    width: 40, height: 4,
    backgroundColor: "#334155",
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
  modalTitle:    { color: "#F8FAFC", fontSize: 18, fontWeight: "700" },
  modalSubtitle: { color: "#64748B", fontSize: 13, marginBottom: 20 },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20
  },
  presetChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: "#0F172A",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155"
  },
  presetChipActive:     { backgroundColor: "#1D4ED8", borderColor: "#3B82F6" },
  presetChipText:       { color: "#94A3B8", fontSize: 14, fontWeight: "600" },
  presetChipTextActive: { color: "#fff" },
  customLabel: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  customInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16
  },
  customInputRowActive: { borderColor: "#3B82F6" },
  currencySymbol: { color: "#60A5FA", fontSize: 18, fontWeight: "700", marginRight: 6 },
  customInput:    { flex: 1, color: "#F8FAFC", fontSize: 18, fontWeight: "600" },
  removeOverrideBtn: {
    flex: 1,
    backgroundColor: "#1E293B",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155"
  },
  removeOverrideBtnText: { color: "#94A3B8", fontSize: 15, fontWeight: "600" },
  saveBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center"
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" }

});
