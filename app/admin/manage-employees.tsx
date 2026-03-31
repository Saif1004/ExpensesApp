import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
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

type Member = {
  id: string;
  userId: string;
  role: "admin" | "employee";
  status: "approved" | "pending" | "none";
  displayName?: string;
  email?: string;
  username?: string;
};

export default function ManageEmployees() {
  const router = useRouter();
  const { role, authLoaded, orgId, user, refreshMembership } = useAuth();

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading]   = useState(true);
  const [actionId, setActionId] = useState<string | null>(null); // tracks which card is mid-action
  const [isOwner, setIsOwner]   = useState(false);
  const [search, setSearch]     = useState("");

  //////////////////////////////////////////////////////
  // REFRESH ROLE ON MOUNT + ADMIN PROTECTION
  //////////////////////////////////////////////////////

  // Refresh membership role immediately when this screen opens.
  // This ensures a newly promoted admin doesn't get redirected due to stale role.
  useEffect(() => { refreshMembership(); }, []);

  useEffect(() => {
    if (!authLoaded) return;
    if (role !== "admin") router.replace("/(tabs)/home");
  }, [role, authLoaded]);

  //////////////////////////////////////////////////////
  // LOAD ORG OWNER FLAG
  //////////////////////////////////////////////////////

  useEffect(() => {
    if (!orgId || !user) return;
    getDoc(doc(db, "organisations", orgId)).then((snap) => {
      if (snap.exists()) {
        setIsOwner(snap.data().ownerId === user.uid);
      }
    }).catch(() => {});
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
          id:          d.id,
          userId:      m.userId,
          role:        m.role ?? "employee",
          status:      m.status ?? "none",
          displayName: m.displayName,
          email:       m.email,
          username:    m.username ?? m.displayName,
        };
      });
      // Sort: pending first, then admins, then employees; self last
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
  // PROMOTE TO ADMIN  (owner-only — also updates orgAdmins array)
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
              // Add to orgAdmins so Firestore rules recognise them as admin
              if (orgId) {
                await updateDoc(doc(db, "organisations", orgId), {
                  orgAdmins: arrayUnion(member.userId)
                });
              }
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
  // DEMOTE TO EMPLOYEE  (owner-only — also removes from orgAdmins)
  //////////////////////////////////////////////////////

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
              // Remove from orgAdmins
              if (orgId) {
                await updateDoc(doc(db, "organisations", orgId), {
                  orgAdmins: arrayRemove(member.userId)
                });
              }
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
              // Remove from orgAdmins first if they were an admin (before deleting the doc)
              if (orgId && member.role === "admin") {
                await updateDoc(doc(db, "organisations", orgId), {
                  orgAdmins: arrayRemove(member.userId)
                });
              }
              // Delete the membership document (rule: isOrgOwner)
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
  // HELPERS
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

  const pendingMembers  = filteredMembers.filter((m) => m.status === "pending");
  const activeMembers   = filteredMembers.filter((m) => m.status === "approved");

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
        item.role === "admin" && !isPending && styles.cardAdmin
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

        {/* Action buttons */}
        {!self && (
          <View style={styles.btnRow}>
            {busy ? (
              <ActivityIndicator color="#38BDF8" style={{ marginTop: 8 }} />
            ) : isPending ? (
              // Pending member actions
              <>
                <TouchableOpacity
                  style={styles.approveBtn}
                  onPress={() => approveMember(item)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark" size={14} color="#fff" style={{ marginRight: 4 }} />
                  <ThemedText style={styles.btnText}>Approve</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => rejectMember(item)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close" size={14} color="#fff" style={{ marginRight: 4 }} />
                  <ThemedText style={styles.btnText}>Reject</ThemedText>
                </TouchableOpacity>
              </>
            ) : (
              // Active member actions
              <>
                {/* Role toggle — only org owner can promote/demote */}
                {isOwner && (
                  item.role === "admin" ? (
                    <TouchableOpacity
                      style={styles.demoteBtn}
                      onPress={() => demoteToEmployee(item)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="arrow-down-circle-outline" size={14} color="#FCD34D" style={{ marginRight: 4 }} />
                      <ThemedText style={styles.demoteBtnText}>Make Employee</ThemedText>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.promoteBtn}
                      onPress={() => promoteToAdmin(item)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="shield-outline" size={14} color="#94A3B8" style={{ marginRight: 4 }} />
                      <ThemedText style={styles.promoteBtnText}>Make Admin</ThemedText>
                    </TouchableOpacity>
                  )
                )}
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => removeMember(item)}
                  activeOpacity={0.8}
                >
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
        <ActivityIndicator size="large" color="#38BDF8" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

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
          <Ionicons name="search-outline" size={16} color="#64748B" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or email…"
            placeholderTextColor="#475569"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
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

          {/* Active members section */}
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: "#22C55E" }]} />
            <ThemedText style={styles.sectionTitle}>
              Members ({activeMembers.length})
            </ThemedText>
          </View>
          {activeMembers.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="people-outline" size={32} color="#334155" />
              <ThemedText style={styles.emptyText}>No members found</ThemedText>
            </View>
          ) : (
            activeMembers.map((m) => renderMember(m, false))
          )}

          {/* Role change warning */}
          {isOwner && (
            <View style={styles.warningCard}>
              <Ionicons name="warning-outline" size={16} color="#F59E0B" style={{ marginRight: 8, marginTop: 1 }} />
              <ThemedText style={styles.warningText}>
                Admins can approve and reject all expense claims. Only promote trusted members.
              </ThemedText>
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0F172A"
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16
  },
  backBtn: { paddingVertical: 4 },
  backBtnText: {
    color: "#38BDF8",
    fontSize: 15,
    fontWeight: "600"
  },
  title: {
    color: "#F8FAFC",
    fontSize: 26,
    fontWeight: "bold"
  },

  /* Search */
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 12,
    marginBottom: 20,
    height: 44
  },
  searchInput: {
    flex: 1,
    color: "#F8FAFC",
    fontSize: 14
  },

  /* Section headers */
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F59E0B"
  },
  sectionTitle: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },

  /* Card */
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#334155"
  },
  cardPending: {
    borderColor: "#78350F",
    backgroundColor: "#1C1508"
  },
  cardAdmin: {
    borderColor: "#1E3A5F"
  },

  /* Card top row */
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarAdmin: { backgroundColor: "#172554" },
  avatarEmployee: { backgroundColor: "#1E293B", borderWidth: 1, borderColor: "#334155" },
  avatarLetter: {
    color: "#93C5FD",
    fontSize: 16,
    fontWeight: "700"
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2
  },
  name: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "600",
    flexShrink: 1
  },
  email: {
    color: "#64748B",
    fontSize: 12
  },
  youBadge: {
    backgroundColor: "#1E3A5F",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  youBadgeText: {
    color: "#93C5FD",
    fontSize: 10,
    fontWeight: "700"
  },

  /* Role badge */
  roleBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start"
  },
  roleBadgeAdmin: { backgroundColor: "#172554", borderWidth: 1, borderColor: "#2563EB" },
  roleBadgeEmployee: { backgroundColor: "#1E293B", borderWidth: 1, borderColor: "#334155" },
  roleBadgeText: { fontSize: 11, fontWeight: "700" },
  roleBadgeTextAdmin: { color: "#93C5FD" },
  roleBadgeTextEmployee: { color: "#64748B" },

  /* Pending badge */
  pendingBadge: {
    backgroundColor: "#451A03",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#78350F"
  },
  pendingBadgeText: {
    color: "#FCD34D",
    fontSize: 11,
    fontWeight: "700"
  },

  /* Button row */
  btnRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12
  },
  btnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13
  },
  approveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#16A34A",
    paddingVertical: 9,
    borderRadius: 10
  },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#7F1D1D",
    paddingVertical: 9,
    borderRadius: 10
  },
  promoteBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E293B",
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155"
  },
  promoteBtnText: {
    color: "#94A3B8",
    fontWeight: "600",
    fontSize: 13
  },
  demoteBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#292524",
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#78350F"
  },
  demoteBtnText: {
    color: "#FCD34D",
    fontWeight: "600",
    fontSize: 13
  },
  removeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#7F1D1D",
    paddingVertical: 9,
    borderRadius: 10
  },

  /* Empty state */
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 32
  },
  emptyText: {
    color: "#475569",
    fontSize: 14
  },

  /* Warning card */
  warningCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#292524",
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#78350F"
  },
  warningText: {
    flex: 1,
    color: "#FCD34D",
    fontSize: 12,
    lineHeight: 18
  }
});
