import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where
} from "firebase/firestore";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "../context/AuthProvider";
import { db } from "../firebase/firebaseConfig";
import { ThemedText } from "../../components/themed-text";
import { useTheme } from "../../hooks/useTheme";

type Member = {
  id: string;
  userId: string;
  role: "admin" | "employee";
  status: "approved" | "pending" | "none";
  displayName?: string;
  email?: string;
  username?: string;
  departmentId?: string;
  departmentName?: string;
  budget?: number;           // monthly budget cap in GBP, 0 = unlimited
};

type Department = {
  id: string;
  name: string;
  code?: string;
};

export default function ManageEmployees() {
  const router = useRouter();
  const { role, authLoaded, orgId, user, refreshMembership } = useAuth();
  const { tokens: t } = useTheme();

  const [members,     setMembers]     = useState<Member[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [actionId,    setActionId]    = useState<string | null>(null);
  const [isOwner,     setIsOwner]     = useState(false);
  const [search,      setSearch]      = useState("");

  // Edit modal state
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editDeptId,    setEditDeptId]    = useState<string>("");
  const [editDeptName,  setEditDeptName]  = useState<string>("");
  const [editBudget,    setEditBudget]    = useState<string>("");
  const [editSaving,    setEditSaving]    = useState(false);
  const slideAnim = useRef(new Animated.Value(300)).current;

  //////////////////////////////////////////////////////
  // REFRESH ROLE ON MOUNT + ADMIN PROTECTION
  //////////////////////////////////////////////////////

  useEffect(() => { refreshMembership(); }, []);

  useEffect(() => {
    if (!authLoaded) return;
    if (role !== "admin") router.replace("/(tabs)/home");
  }, [role, authLoaded]);

  //////////////////////////////////////////////////////
  // LOAD ORG OWNER FLAG + DEPARTMENTS
  //////////////////////////////////////////////////////

  useEffect(() => {
    if (!orgId || !user) return;
    getDoc(doc(db, "organisations", orgId)).then((snap) => {
      if (snap.exists()) setIsOwner(snap.data().ownerId === user.uid);
    }).catch(() => {});

    // Load departments for the picker
    getDocs(query(collection(db, "departments"), where("orgId", "==", orgId)))
      .then(snap => {
        setDepartments(snap.docs.map(d => ({
          id:   d.id,
          name: d.data().name,
          code: d.data().code ?? "",
        })));
      })
      .catch(() => {});
  }, [orgId, user]);

  //////////////////////////////////////////////////////
  // LOAD MEMBERS
  //////////////////////////////////////////////////////

  const loadMembers = async () => {
    if (!user?.emailVerified || !orgId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const snap = await getDocs(
        query(collection(db, "memberships"), where("orgId", "==", orgId))
      );
      const list: Member[] = snap.docs.map((d) => {
        const m = d.data();
        return {
          id:             d.id,
          userId:         m.userId,
          role:           m.role ?? "employee",
          status:         m.status ?? "none",
          displayName:    m.displayName,
          email:          m.email,
          username:       m.username ?? m.displayName,
          departmentId:   m.departmentId   ?? "",
          departmentName: m.departmentName ?? "",
          budget:         m.budget         ?? 0,
        };
      });
      list.sort((a, b) => {
        if (a.userId === user.uid) return 1;
        if (b.userId === user.uid) return -1;
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (b.status === "pending" && a.status !== "pending") return 1;
        if (a.role === "admin" && b.role !== "admin") return -1;
        if (b.role === "admin" && a.role !== "admin") return 1;
        return 0;
      });
      setMembers(list);
    } catch (err) {
      console.log("Load members error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMembers(); }, [orgId, user]);

  //////////////////////////////////////////////////////
  // EDIT MODAL HELPERS
  //////////////////////////////////////////////////////

  const openEdit = (member: Member) => {
    setEditingMember(member);
    setEditDeptId(member.departmentId ?? "");
    setEditDeptName(member.departmentName ?? "");
    setEditBudget(member.budget ? String(member.budget) : "");
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
  };

  const closeEdit = () => {
    Animated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: true }).start(() => {
      setEditingMember(null);
    });
  };

  const saveEdit = async () => {
    if (!editingMember) return;
    setEditSaving(true);
    try {
      const budgetVal = editBudget.trim() ? Number(editBudget.trim()) : 0;
      if (editBudget.trim() && (isNaN(budgetVal) || budgetVal < 0)) {
        Alert.alert("Invalid budget", "Please enter a valid positive number.");
        return;
      }
      await updateDoc(doc(db, "memberships", editingMember.id), {
        departmentId:   editDeptId   || "",
        departmentName: editDeptName || "",
        budget:         budgetVal,
      });
      // Update local state immediately
      setMembers(prev => prev.map(m =>
        m.id === editingMember.id
          ? { ...m, departmentId: editDeptId, departmentName: editDeptName, budget: budgetVal }
          : m
      ));
      closeEdit();
    } catch {
      Alert.alert("Error", "Failed to save changes. Please try again.");
    } finally {
      setEditSaving(false);
    }
  };

  const selectDept = (dept: Department) => {
    if (editDeptId === dept.id) {
      // Deselect
      setEditDeptId("");
      setEditDeptName("");
    } else {
      setEditDeptId(dept.id);
      setEditDeptName(dept.name);
    }
  };

  //////////////////////////////////////////////////////
  // APPROVE PENDING MEMBER
  //////////////////////////////////////////////////////

  const approveMember = async (member: Member) => {
    setActionId(member.id);
    try {
      await updateDoc(doc(db, "memberships", member.id), { status: "approved" });
      await loadMembers();
    } catch {
      Alert.alert("Error", "Failed to approve member.");
    } finally {
      setActionId(null);
    }
  };

  //////////////////////////////////////////////////////
  // REJECT PENDING MEMBER
  //////////////////////////////////////////////////////

  const rejectMember = (member: Member) => {
    Alert.alert(
      "Reject Member",
      `Remove ${member.displayName || member.email || "this user"}'s pending request?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setActionId(member.id);
            try {
              await updateDoc(doc(db, "memberships", member.id), { status: "none" });
              await loadMembers();
            } catch {
              Alert.alert("Error", "Failed to reject member.");
            } finally {
              setActionId(null);
            }
          }
        }
      ]
    );
  };

  //////////////////////////////////////////////////////
  // PROMOTE / DEMOTE
  //////////////////////////////////////////////////////

  const promoteToAdmin = (member: Member) => {
    const name = member.displayName || member.email || "this user";
    Alert.alert(
      "Make Admin?",
      `Promoting ${name} to admin gives them full access to the admin panel — they can approve or reject all expense claims.\n\nThis should only be given to trusted managers.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Make Admin",
          style: "destructive",
          onPress: async () => {
            setActionId(member.id);
            try {
              await updateDoc(doc(db, "memberships", member.id), { role: "admin" });
              if (orgId) await updateDoc(doc(db, "organisations", orgId), { orgAdmins: arrayUnion(member.userId) });
              await loadMembers();
            } catch {
              Alert.alert("Error", "Failed to update role.");
            } finally {
              setActionId(null);
            }
          }
        }
      ]
    );
  };

  const demoteToEmployee = (member: Member) => {
    const name = member.displayName || member.email || "this user";
    Alert.alert(
      "Remove Admin Access?",
      `${name} will no longer be able to approve or reject claims.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Make Employee",
          onPress: async () => {
            setActionId(member.id);
            try {
              await updateDoc(doc(db, "memberships", member.id), { role: "employee" });
              if (orgId) await updateDoc(doc(db, "organisations", orgId), { orgAdmins: arrayRemove(member.userId) });
              await loadMembers();
            } catch {
              Alert.alert("Error", "Failed to update role.");
            } finally {
              setActionId(null);
            }
          }
        }
      ]
    );
  };

  //////////////////////////////////////////////////////
  // REMOVE MEMBER
  //////////////////////////////////////////////////////

  const removeMember = (member: Member) => {
    const name = member.displayName || member.email || "this user";
    Alert.alert(
      "Remove Member",
      `Remove ${name} from your organisation? They will lose access immediately.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setActionId(member.id);
            try {
              if (orgId && member.role === "admin") {
                await updateDoc(doc(db, "organisations", orgId), { orgAdmins: arrayRemove(member.userId) });
              }
              await deleteDoc(doc(db, "memberships", member.id));
              await loadMembers();
            } catch {
              Alert.alert("Error", "Failed to remove member.");
            } finally {
              setActionId(null);
            }
          }
        }
      ]
    );
  };

  //////////////////////////////////////////////////////
  // FILTER
  //////////////////////////////////////////////////////

  const isSelf = (m: Member) => m.userId === user?.uid;

  const filteredMembers = search.trim()
    ? members.filter((m) => {
        const q = search.toLowerCase();
        return (
          m.displayName?.toLowerCase().includes(q) ||
          m.email?.toLowerCase().includes(q) ||
          m.username?.toLowerCase().includes(q)
        );
      })
    : members;

  const pendingMembers = filteredMembers.filter((m) => m.status === "pending");
  const activeMembers  = filteredMembers.filter((m) => m.status === "approved");

  //////////////////////////////////////////////////////
  // STYLES
  //////////////////////////////////////////////////////

  const styles = useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.bg },
    container: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
    header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
    backBtn: { paddingVertical: 4 },
    backBtnText: { color: t.textSecondary, fontSize: 15, fontWeight: "600" },
    title: { color: t.text, fontSize: 28, fontWeight: "800", letterSpacing: -1 },

    searchWrap: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: t.surface, borderRadius: 999,
      paddingHorizontal: 16, marginBottom: 20, height: 46
    },
    searchInput: { flex: 1, color: t.text, fontSize: 14 },

    sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
    sectionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.warning },
    sectionTitle: {
      color: t.textSecondary, fontSize: 12, fontWeight: "700",
      textTransform: "uppercase", letterSpacing: 0.6
    },

    card: { backgroundColor: t.surface, borderRadius: 18, padding: 16, marginBottom: 10 },
    cardPending: { backgroundColor: t.warningSurface },

    cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
    avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    avatarAdmin:    { backgroundColor: t.accentSurface },
    avatarEmployee: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border },
    avatarLetter:   { color: t.accent, fontSize: 16, fontWeight: "700" },

    nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
    name:    { color: t.text, fontSize: 15, fontWeight: "600", flexShrink: 1 },
    email:   { color: t.textSecondary, fontSize: 12 },

    youBadge:     { backgroundColor: t.surfaceAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
    youBadgeText: { color: t.textSecondary, fontSize: 10, fontWeight: "700" },

    roleBadge:         { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
    roleBadgeAdmin:    { backgroundColor: t.accentSurface },
    roleBadgeEmployee: { backgroundColor: t.surfaceAlt },
    roleBadgeText:         { fontSize: 11, fontWeight: "700" },
    roleBadgeTextAdmin:    { color: t.accent },
    roleBadgeTextEmployee: { color: t.textSecondary },

    pendingBadge:     { backgroundColor: t.warningSurface, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    pendingBadgeText: { color: t.warning, fontSize: 11, fontWeight: "700" },

    // Dept + budget info chips below name
    metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
    metaChip: {
      flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: t.surfaceAlt, borderRadius: 999,
      paddingHorizontal: 10, paddingVertical: 4,
    },
    metaChipText: { color: t.textSecondary, fontSize: 11, fontWeight: "600" },

    btnRow: { flexDirection: "row", gap: 8, marginTop: 12 },
    btnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

    approveBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: t.success, paddingVertical: 10, borderRadius: 999 },
    rejectBtn:  { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: t.errorSurface, paddingVertical: 10, borderRadius: 999 },
    promoteBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: t.accentSurface, paddingVertical: 10, borderRadius: 999 },
    promoteBtnText: { color: t.accent, fontWeight: "700", fontSize: 13 },
    demoteBtn:  { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: t.warningSurface, paddingVertical: 10, borderRadius: 999 },
    demoteBtnText: { color: t.warning, fontWeight: "700", fontSize: 13 },
    removeBtn:  { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: t.error, paddingVertical: 10, borderRadius: 999 },

    editBtn: {
      width: 38, height: 38, borderRadius: 999,
      backgroundColor: t.surfaceAlt,
      alignItems: "center", justifyContent: "center",
    },

    emptyCard: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 32 },
    emptyText: { color: t.textTertiary, fontSize: 14 },

    warningCard: {
      flexDirection: "row", alignItems: "flex-start",
      backgroundColor: t.warningSurface, borderRadius: 16, padding: 14, marginTop: 8,
    },
    warningText: { flex: 1, color: t.warning, fontSize: 12, lineHeight: 18 },

    // ── Edit Modal ──────────────────────────────────────────
    overlay:   { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: t.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 36,
    },
    sheetHandle: {
      width: 36, height: 4, borderRadius: 2,
      backgroundColor: t.border, alignSelf: "center", marginBottom: 16,
    },
    sheetTitle:   { color: t.text, fontSize: 18, fontWeight: "700", marginBottom: 4 },
    sheetSubtitle:{ color: t.textSecondary, fontSize: 13, marginBottom: 20 },

    sheetLabel: { color: t.textSecondary, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },

    deptGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
    deptChip: {
      borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
      backgroundColor: t.surfaceAlt, borderWidth: 1.5, borderColor: "transparent",
    },
    deptChipSelected: { backgroundColor: t.accentSurface, borderColor: t.accent },
    deptChipText:         { color: t.textSecondary, fontSize: 13, fontWeight: "600" },
    deptChipTextSelected: { color: t.accent },
    noDeptChip: {
      borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
      backgroundColor: t.surfaceAlt, borderWidth: 1.5, borderColor: "transparent",
    },
    noDeptChipSelected: { backgroundColor: t.errorSurface, borderColor: t.error },
    noDeptChipText:         { color: t.textSecondary, fontSize: 13, fontWeight: "600" },
    noDeptChipTextSelected: { color: t.error },

    budgetRow: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: t.surfaceAlt, borderRadius: 14,
      paddingHorizontal: 16, height: 50, marginBottom: 24,
    },
    budgetPrefix: { color: t.textSecondary, fontSize: 16, fontWeight: "600", marginRight: 6 },
    budgetInput:  { flex: 1, color: t.text, fontSize: 16 },
    budgetHint:   { color: t.textTertiary, fontSize: 12, marginTop: -18, marginBottom: 20 },

    sheetBtnRow: { flexDirection: "row", gap: 10 },
    cancelBtn: {
      flex: 1, paddingVertical: 14, borderRadius: 999,
      backgroundColor: t.surfaceAlt, alignItems: "center",
    },
    cancelBtnText: { color: t.textSecondary, fontWeight: "700", fontSize: 15 },
    saveBtn: {
      flex: 2, paddingVertical: 14, borderRadius: 999,
      backgroundColor: t.accent, alignItems: "center",
    },
    saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  }), [t]);

  //////////////////////////////////////////////////////
  // RENDER CARD
  //////////////////////////////////////////////////////

  const renderMember = (item: Member, isPending: boolean) => {
    const busy = actionId === item.id;
    const self = isSelf(item);
    const name = item.displayName || item.username || "Unknown User";

    return (
      <View key={item.id} style={[
        styles.card,
        isPending && styles.cardPending,
      ]}>

        {/* Avatar + info */}
        <View style={styles.cardTop}>
          <View style={[
            styles.avatar,
            item.role === "admin" ? styles.avatarAdmin : styles.avatarEmployee
          ]}>
            <ThemedText style={styles.avatarLetter}>
              {(name[0] ?? "?").toUpperCase()}
            </ThemedText>
          </View>

          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <ThemedText style={styles.name} numberOfLines={1}>{name}</ThemedText>
              {self && (
                <View style={styles.youBadge}>
                  <ThemedText style={styles.youBadgeText}>You</ThemedText>
                </View>
              )}
            </View>
            <ThemedText style={styles.email} numberOfLines={1}>
              {item.email || "No email"}
            </ThemedText>
          </View>

          {/* Role / status badge */}
          {isPending ? (
            <View style={styles.pendingBadge}>
              <ThemedText style={styles.pendingBadgeText}>Pending</ThemedText>
            </View>
          ) : (
            <View style={[
              styles.roleBadge,
              item.role === "admin" ? styles.roleBadgeAdmin : styles.roleBadgeEmployee
            ]}>
              <ThemedText style={[
                styles.roleBadgeText,
                item.role === "admin" ? styles.roleBadgeTextAdmin : styles.roleBadgeTextEmployee
              ]}>
                {item.role === "admin" ? "Admin" : "Employee"}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Department + budget chips for active members */}
        {!isPending && !!(item.departmentName || (item.budget != null && item.budget > 0)) && (
          <View style={styles.metaRow}>
            {!!item.departmentName && (
              <View style={styles.metaChip}>
                <Ionicons name="business-outline" size={11} color={t.textSecondary} />
                <ThemedText style={styles.metaChipText}>{item.departmentName}</ThemedText>
              </View>
            )}
            {item.budget != null && item.budget > 0 && (
              <View style={styles.metaChip}>
                <Ionicons name="wallet-outline" size={11} color={t.textSecondary} />
                <ThemedText style={styles.metaChipText}>£{item.budget.toLocaleString()}/mo</ThemedText>
              </View>
            )}
          </View>
        )}

        {/* Action buttons */}
        {!self && (
          <View style={styles.btnRow}>
            {busy ? (
              <ActivityIndicator color={t.accent} style={{ marginTop: 8 }} />
            ) : isPending ? (
              <>
                <TouchableOpacity style={styles.approveBtn} onPress={() => approveMember(item)} activeOpacity={0.8}>
                  <Ionicons name="checkmark" size={14} color="#fff" style={{ marginRight: 4 }} />
                  <ThemedText style={styles.btnText}>Approve</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.rejectBtn} onPress={() => rejectMember(item)} activeOpacity={0.8}>
                  <Ionicons name="close" size={14} color="#fff" style={{ marginRight: 4 }} />
                  <ThemedText style={styles.btnText}>Reject</ThemedText>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Edit dept/budget */}
                <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)} activeOpacity={0.8}>
                  <Ionicons name="pencil-outline" size={15} color={t.textSecondary} />
                </TouchableOpacity>

                {/* Role toggle — owner only */}
                {isOwner && (
                  item.role === "admin" ? (
                    <TouchableOpacity style={styles.demoteBtn} onPress={() => demoteToEmployee(item)} activeOpacity={0.8}>
                      <Ionicons name="arrow-down-circle-outline" size={14} color={t.warning} style={{ marginRight: 4 }} />
                      <ThemedText style={styles.demoteBtnText}>Make Employee</ThemedText>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.promoteBtn} onPress={() => promoteToAdmin(item)} activeOpacity={0.8}>
                      <Ionicons name="shield-outline" size={14} color={t.accent} style={{ marginRight: 4 }} />
                      <ThemedText style={styles.promoteBtnText}>Make Admin</ThemedText>
                    </TouchableOpacity>
                  )
                )}

                <TouchableOpacity style={styles.removeBtn} onPress={() => removeMember(item)} activeOpacity={0.8}>
                  <Ionicons name="person-remove-outline" size={14} color="#fff" style={{ marginRight: 4 }} />
                  <ThemedText style={styles.btnText}>Remove</ThemedText>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>
    );
  };

  //////////////////////////////////////////////////////
  // UI
  //////////////////////////////////////////////////////

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator size="large" color={t.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  const editName = editingMember
    ? (editingMember.displayName || editingMember.username || "Employee")
    : "";

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ThemedText style={styles.backBtnText}>← Back</ThemedText>
          </TouchableOpacity>
          <ThemedText type="title" style={styles.title}>Team</ThemedText>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color={t.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or email…"
            placeholderTextColor={t.textTertiary}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

          {/* Pending section */}
          {pendingMembers.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionDot} />
                <ThemedText style={styles.sectionTitle}>
                  Pending Approval ({pendingMembers.length})
                </ThemedText>
              </View>
              {pendingMembers.map((m) => renderMember(m, true))}
            </>
          )}

          {/* Active members */}
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: t.success }]} />
            <ThemedText style={styles.sectionTitle}>Members ({activeMembers.length})</ThemedText>
          </View>
          {activeMembers.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="people-outline" size={32} color={t.border} />
              <ThemedText style={styles.emptyText}>No members found</ThemedText>
            </View>
          ) : (
            activeMembers.map((m) => renderMember(m, false))
          )}

          {/* Role change warning */}
          {isOwner && (
            <View style={styles.warningCard}>
              <Ionicons name="warning-outline" size={16} color={t.warning} style={{ marginRight: 8, marginTop: 1 }} />
              <ThemedText style={styles.warningText}>
                Admins can approve and reject all expense claims. Only promote trusted members.
              </ThemedText>
            </View>
          )}
        </ScrollView>
      </View>

      {/* ── Edit Department & Budget Modal ───────────────── */}
      <Modal
        visible={!!editingMember}
        transparent
        animationType="none"
        onRequestClose={closeEdit}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <TouchableWithoutFeedback onPress={closeEdit}>
            <View style={styles.overlay}>
              <TouchableWithoutFeedback>
                <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
                  <View style={styles.sheetHandle} />
                  <ThemedText style={styles.sheetTitle}>{editName}</ThemedText>
                  <ThemedText style={styles.sheetSubtitle}>Set department and monthly budget</ThemedText>

                  {/* Department picker */}
                  <ThemedText style={styles.sheetLabel}>Department</ThemedText>
                  <View style={styles.deptGrid}>
                    {/* No department option */}
                    <TouchableOpacity
                      style={[styles.noDeptChip, !editDeptId && styles.noDeptChipSelected]}
                      onPress={() => { setEditDeptId(""); setEditDeptName(""); }}
                      activeOpacity={0.7}
                    >
                      <ThemedText style={[styles.noDeptChipText, !editDeptId && styles.noDeptChipTextSelected]}>
                        None
                      </ThemedText>
                    </TouchableOpacity>

                    {departments.length === 0 ? (
                      <ThemedText style={{ color: t.textTertiary, fontSize: 13, alignSelf: "center" }}>
                        No departments yet — add them in Manage Departments
                      </ThemedText>
                    ) : (
                      departments.map(dept => (
                        <TouchableOpacity
                          key={dept.id}
                          style={[styles.deptChip, editDeptId === dept.id && styles.deptChipSelected]}
                          onPress={() => selectDept(dept)}
                          activeOpacity={0.7}
                        >
                          <ThemedText style={[styles.deptChipText, editDeptId === dept.id && styles.deptChipTextSelected]}>
                            {dept.name}
                          </ThemedText>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>

                  {/* Monthly budget */}
                  <ThemedText style={styles.sheetLabel}>Monthly Budget</ThemedText>
                  <View style={styles.budgetRow}>
                    <ThemedText style={styles.budgetPrefix}>£</ThemedText>
                    <TextInput
                      style={styles.budgetInput}
                      placeholder="Unlimited"
                      placeholderTextColor={t.textTertiary}
                      value={editBudget}
                      onChangeText={v => setEditBudget(v.replace(/[^0-9.]/g, ""))}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                    />
                  </View>
                  <ThemedText style={styles.budgetHint}>
                    Leave blank for no spending limit
                  </ThemedText>

                  {/* Buttons */}
                  <View style={styles.sheetBtnRow}>
                    <TouchableOpacity style={styles.cancelBtn} onPress={closeEdit} activeOpacity={0.8}>
                      <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.saveBtn} onPress={saveEdit} activeOpacity={0.8} disabled={editSaving}>
                      {editSaving
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <ThemedText style={styles.saveBtnText}>Save Changes</ThemedText>
                      }
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
