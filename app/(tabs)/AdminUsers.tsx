import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where
} from "firebase/firestore";

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import { db } from "../firebase/firebaseConfig";
import { useAuth } from "../context/AuthProvider";

type UserItem = {
  id: string;
  userId: string;
  displayName?: string;
  email?: string;
  role?: string;
  status?: string;
};

function getInitials(displayName?: string, email?: string): string {
  if (displayName && displayName.trim().length > 0) {
    const parts = displayName.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return displayName.trim()[0].toUpperCase();
  }
  if (email) {
    return email[0].toUpperCase();
  }
  return "?";
}

export default function AdminUsers() {

  const { employeeLimit, orgPlan, orgId, user } = useAuth();

  const [users, setUsers]                   = useState<UserItem[]>([]);
  const [approvedCount, setApprovedCount]   = useState(0);
  const [loading, setLoading]               = useState(true);
  const [tab, setTab]                       = useState<"pending" | "approved" | "rejected">("pending");
  const [pendingCount, setPendingCount]     = useState(0);
  const [searchQuery, setSearchQuery]       = useState("");

  //////////////////////////////////////////////////////
  // LOAD USERS
  //////////////////////////////////////////////////////

  const loadUsers = async () => {

    try {

      setLoading(true);

      if (!user?.emailVerified || !orgId) {
        setUsers([]);
        setLoading(false);
        return;
      }

      //////////////////////////////////////////////////////
      // QUERY MEMBERS BY STATUS
      //////////////////////////////////////////////////////

      const q = query(
        collection(db, "memberships"),
        where("orgId", "==", orgId),
        where("status", "==", tab)
      );

      const snap = await getDocs(q);

      const list: UserItem[] = snap.docs.map((docSnap) => {
        const membership = docSnap.data();
        return {
          id:          docSnap.id,
          userId:      membership.userId,
          role:        membership.role,
          status:      membership.status,
          // displayName + email are stored on the membership doc at sign-up
          // so we never need to cross-read users/{uid} (which is owner-only)
          displayName: membership.displayName,
          email:       membership.email,
        };
      });

      setUsers(list);

      //////////////////////////////////////////////////////
      // UPDATE BADGE COUNT + APPROVED COUNT
      //////////////////////////////////////////////////////

      if (tab === "pending") {
        setPendingCount(list.length);
      }

      if (tab === "approved") {
        setApprovedCount(list.length);
      } else {
        // Always keep approved count fresh
        const approvedSnap = await getDocs(query(
          collection(db, "memberships"),
          where("orgId", "==", orgId),
          where("status", "==", "approved")
        ));
        setApprovedCount(approvedSnap.size);
      }

    } catch (error) {

      console.log("LOAD USERS ERROR:", error);
      Alert.alert("Error", "Could not load users.");

    } finally {

      setLoading(false);

    }

  };

  //////////////////////////////////////////////////////
  // LOAD BADGE COUNT
  //////////////////////////////////////////////////////

  const loadPendingCount = async () => {

    try {

      if (!user?.emailVerified || !orgId) return;

      const q = query(
        collection(db, "memberships"),
        where("orgId", "==", orgId),
        where("status", "==", "pending")
      );

      const snap = await getDocs(q);
      setPendingCount(snap.size);

    } catch (err) {

      console.log("COUNT ERROR:", err);

    }

  };

  useEffect(() => {
    loadPendingCount();
  }, [orgId, user]);

  useEffect(() => {
    loadUsers();
  }, [tab, orgId, user]);

  //////////////////////////////////////////////////////
  // APPROVE
  //////////////////////////////////////////////////////

  const approveUser = async (membershipId: string) => {

    try {

      // Enforce employee limit (admin counts as 1 approved member)
      if (approvedCount >= employeeLimit) {
        Alert.alert(
          "Employee limit reached",
          `Your ${orgPlan} plan allows up to ${employeeLimit} members. Upgrade your plan to add more.`
        );
        return;
      }

      await updateDoc(
        doc(db, "memberships", membershipId),
        { status: "approved" }
      );

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

      await updateDoc(
        doc(db, "memberships", membershipId),
        { status: "rejected" }
      );

      loadUsers();
      loadPendingCount();

    } catch (error) {

      console.log("REJECT ERROR:", error);
      Alert.alert("Error", "Could not reject user.");

    }

  };

  //////////////////////////////////////////////////////
  // FILTERED USERS
  //////////////////////////////////////////////////////

  const filteredUsers = users.filter((user) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = user.displayName?.toLowerCase().includes(q) ?? false;
    const emailMatch = user.email?.toLowerCase().includes(q) ?? false;
    return nameMatch || emailMatch;
  });

  //////////////////////////////////////////////////////
  // TAB BUTTON
  //////////////////////////////////////////////////////

  const TabButton = (name: "pending" | "approved" | "rejected", label: string) => (

    <TouchableOpacity
      style={[
        styles.tab,
        tab === name && styles.tabActive
      ]}
      onPress={() => {
        setTab(name);
        if (name === "pending") {
          setPendingCount(0);
        }
      }}
    >

      <Text style={[
        styles.tabText,
        tab === name && styles.tabTextActive
      ]}>
        {label}
      </Text>

      {name === "pending" && pendingCount > 0 && (

        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {pendingCount}
          </Text>
        </View>

      )}

    </TouchableOpacity>

  );

  //////////////////////////////////////////////////////
  // UI
  //////////////////////////////////////////////////////

  return (

    <SafeAreaView style={styles.container}>

      <Text style={styles.title}>Admin Panel</Text>

      <View style={styles.limitRow}>
        <Text style={styles.limitText}>
          Members: {approvedCount} / {employeeLimit}
        </Text>
        {approvedCount >= employeeLimit && (
          <Text style={styles.limitWarning}>Limit reached</Text>
        )}
      </View>

      {/* Search bar */}
      <View style={styles.searchWrapper}>
        <Text style={styles.searchIcon}>🔍</Text>
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
        {TabButton("pending", "Pending")}
        {TabButton("approved", "Approved")}
        {TabButton("rejected", "Rejected")}
      </View>

      {loading ? (

        <ActivityIndicator color="#38BDF8" size="large" style={{ marginTop: 40 }} />

      ) : (

        <ScrollView showsVerticalScrollIndicator={false}>

          {filteredUsers.length === 0 ? (

            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>
                {searchQuery.trim() ? "🔍" : "👤"}
              </Text>
              <Text style={styles.empty}>
                {searchQuery.trim()
                  ? `No results for "${searchQuery}"`
                  : `No ${tab} users`}
              </Text>
            </View>

          ) : (

            filteredUsers.map((user) => (

              <View key={user.id} style={styles.card}>

                <View style={styles.cardTop}>

                  {/* Avatar initials */}
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {getInitials(user.displayName, user.email)}
                    </Text>
                  </View>

                  {/* Name + email */}
                  <View style={styles.userInfo}>
                    <Text style={styles.name}>
                      {user.displayName || "Unknown"}
                    </Text>
                    <Text style={styles.email}>
                      {user.email || "No email"}
                    </Text>
                  </View>

                  {/* Role badge */}
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>
                      {user.role || "employee"}
                    </Text>
                  </View>

                </View>

                {tab === "pending" && (

                  <View style={styles.buttons}>

                    <TouchableOpacity
                      style={styles.approveBtn}
                      onPress={() => approveUser(user.id)}
                    >
                      <Text style={styles.approveBtnText}>Approve</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => rejectUser(user.id)}
                    >
                      <Text style={styles.rejectBtnText}>Reject</Text>
                    </TouchableOpacity>

                  </View>

                )}

              </View>

            ))

          )}

        </ScrollView>

      )}

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

  limitText: {
    color: "#64748B",
    fontSize: 12
  },

  limitWarning: {
    color: "#F97316",
    fontSize: 11,
    fontWeight: "700"
  },

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
  searchIcon: {
    fontSize: 14,
    marginRight: 8
  },
  searchInput: {
    flex: 1,
    color: "#F8FAFC",
    fontSize: 14
  },

  /* Tabs */
  tabs: {
    flexDirection: "row",
    marginBottom: 20,
    gap: 8
  },

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

  tabActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB"
  },

  tabText: {
    color: "#94A3B8",
    fontWeight: "600",
    fontSize: 13
  },

  tabTextActive: {
    color: "#fff"
  },

  badge: {
    backgroundColor: "#DC2626",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2
  },

  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700"
  },

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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0
  },

  avatarText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16
  },

  userInfo: {
    flex: 1
  },

  name: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "600"
  },

  email: {
    color: "#94A3B8",
    marginTop: 2,
    fontSize: 12
  },

  /* Role badge */
  roleBadge: {
    backgroundColor: "#0F172A",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#38BDF8"
  },

  roleBadgeText: {
    color: "#38BDF8",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize"
  },

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

  approveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14
  },

  rejectBtnText: {
    color: "#DC2626",
    fontWeight: "700",
    fontSize: 14
  },

  /* Empty state */
  emptyState: {
    alignItems: "center",
    marginTop: 60,
    gap: 10
  },

  emptyIcon: {
    fontSize: 36
  },

  empty: {
    color: "#94A3B8",
    textAlign: "center",
    fontSize: 14
  }

});
