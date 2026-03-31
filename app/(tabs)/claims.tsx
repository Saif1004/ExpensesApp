import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where
} from "firebase/firestore";

import { useEffect, useState } from "react";

import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";

import { useAuth } from "../context/AuthProvider";
import { db } from "../firebase/firebaseConfig";
import { addListener } from "../../utils/listenerStore";

const LAST_SEEN_KEY = "claims_last_seen";

type Claim = {
  id: string;
  amount: number;
  merchant: string;
  category: string;
  status: "pending" | "approved" | "rejected";
  createdAt: Timestamp;
  receiptUrl?: string;
  approvedBy?: string;
  adminFeedback?: string;
  paymentStatus?: string;
};

/////////////////////////////////////////////////////////
// Date helper — "27 Mar"
/////////////////////////////////////////////////////////

function formatDate(ts: Timestamp): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun",
                  "Jul","Aug","Sep","Oct","Nov","Dec"];
  const d = ts.toDate();
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export default function ClaimsScreen() {

  const { user } = useAuth();

  const [allClaims, setAllClaims] = useState<Claim[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [search, setSearch] = useState("");

  const [counts, setCounts] = useState({
    pending: 0,
    approved: 0,
    rejected: 0
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [filter, setFilter] =
    useState<"pending" | "approved" | "rejected">("pending");

  const [viewReceipt, setViewReceipt] =
    useState<string | null>(null);

  /////////////////////////////////////////////////////////
  // Reset badge
  /////////////////////////////////////////////////////////

  useEffect(() => {
    AsyncStorage.setItem(LAST_SEEN_KEY, Date.now().toString());
  }, []);

  /////////////////////////////////////////////////////////
  // Firestore
  /////////////////////////////////////////////////////////

  useEffect(() => {

    if (!user) return;

    const q = query(
      collection(db, "claims"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsub = addListener(onSnapshot(q, (snapshot) => {

      const data: Claim[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Claim, "id">)
      }));

      setAllClaims(data);

      const temp = { pending: 0, approved: 0, rejected: 0 };
      data.forEach(c => { temp[c.status]++; });
      setCounts(temp);

      setLoading(false);
      setRefreshing(false);

    }, () => { /* silently swallow permission-denied on sign-out/delete */ }));

    return unsub;

  }, [user]);

  /////////////////////////////////////////////////////////
  // Filter + search
  /////////////////////////////////////////////////////////

  useEffect(() => {
    const base = allClaims.filter(c => c.status === filter);
    if (!search.trim()) {
      setClaims(base);
      return;
    }
    const q = search.toLowerCase();
    setClaims(base.filter(c =>
      c.merchant.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    ));
  }, [filter, allClaims, search]);

  /////////////////////////////////////////////////////////
  // Pull refresh
  /////////////////////////////////////////////////////////

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  /////////////////////////////////////////////////////////
  // Badge colours
  /////////////////////////////////////////////////////////

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "approved": return styles.badgeApproved;
      case "pending":  return styles.badgePending;
      case "rejected": return styles.badgeRejected;
      default:         return styles.badgePending;
    }
  };

  const getStatusTextStyle = (status: string) => {
    switch (status) {
      case "approved": return styles.badgeTextApproved;
      case "pending":  return styles.badgeTextPending;
      case "rejected": return styles.badgeTextRejected;
      default:         return styles.badgeTextPending;
    }
  };

  /////////////////////////////////////////////////////////
  // UI
  /////////////////////////////////////////////////////////

  return (
    <ThemedView style={styles.container}>

      {/* Title */}
      <ThemedText type="title" style={styles.title}>
        My Claims
      </ThemedText>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color="#64748B" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by merchant or category…"
          placeholderTextColor="#475569"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {(["pending", "approved", "rejected"] as const).map((status) => (
          <TouchableOpacity
            key={status}
            onPress={() => setFilter(status)}
            style={[
              styles.filterBtn,
              filter === status && styles.filterActive
            ]}
            activeOpacity={0.7}
          >
            <ThemedText
              style={filter === status ? styles.filterTextActive : styles.filterText}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </ThemedText>
            <View style={[
              styles.countPill,
              filter === status ? styles.countPillActive : styles.countPillInactive
            ]}>
              <ThemedText style={[
                styles.countText,
                filter === status && styles.countTextActive
              ]}>
                {counts[status]}
              </ThemedText>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loading ? (

        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
        </View>

      ) : claims.length === 0 ? (

        <View style={styles.emptyCard}>
          <Ionicons name="receipt-outline" size={36} color="#334155" />
          <ThemedText style={styles.emptyText}>
            {search.trim()
              ? "No claims match your search"
              : `No ${filter} claims`}
          </ThemedText>
        </View>

      ) : (

        <FlatList
          data={claims}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#38BDF8"
            />
          }
          renderItem={({ item }) => (

            <TouchableOpacity
              style={styles.claimCard}
              onPress={() => router.push(`/claims/${item.id}`)}
              activeOpacity={0.75}
            >

              {/* Header row: amount + date */}
              <View style={styles.cardHeader}>
                <ThemedText style={styles.amount}>
                  £{item.amount.toFixed(2)}
                </ThemedText>
                <ThemedText style={styles.dateText}>
                  {item.createdAt ? formatDate(item.createdAt) : ""}
                </ThemedText>
              </View>

              {/* Merchant + category */}
              <View style={styles.metaRow}>
                <Ionicons name="storefront-outline" size={13} color="#64748B" />
                <ThemedText style={styles.merchant}>{item.merchant}</ThemedText>
                <View style={styles.dot} />
                <ThemedText style={styles.category}>{item.category}</ThemedText>
              </View>

              {/* Status badge row */}
              <View style={styles.statusRow}>
                <View style={[styles.statusBadge, getStatusStyle(item.status)]}>
                  <ThemedText style={[styles.statusText, getStatusTextStyle(item.status)]}>
                    {item.status.toUpperCase()}
                  </ThemedText>
                </View>

                {/* Reimbursed pill */}
                {item.paymentStatus === "paid" && (
                  <View style={styles.paidBadge}>
                    <ThemedText style={styles.paidText}>💳 Reimbursed</ThemedText>
                  </View>
                )}

                {/* Payment Failed pill */}
                {item.paymentStatus === "failed" && (
                  <View style={styles.failedBadge}>
                    <ThemedText style={styles.failedText}>⚠️ Payment Failed</ThemedText>
                  </View>
                )}
              </View>

              {/* Approved / rejected by line */}
              {item.status === "approved" && item.approvedBy && (
                <ThemedText style={styles.approvedBy}>
                  ✓ Approved by {item.approvedBy}
                </ThemedText>
              )}
              {item.status === "rejected" && item.approvedBy && (
                <ThemedText style={styles.rejectedBy}>
                  ✗ Rejected by {item.approvedBy}
                </ThemedText>
              )}

              {/* Admin message */}
              {!!item.adminFeedback && (
                <View style={styles.messageBubble}>
                  <Ionicons name="chatbubble-outline" size={13} color="#94A3B8" style={{ marginTop: 1 }} />
                  <ThemedText style={styles.messageText}>
                    {item.adminFeedback}
                  </ThemedText>
                </View>
              )}

              {/* Receipt thumbnail */}
              {item.receiptUrl && (
                <TouchableOpacity
                  onPress={() => setViewReceipt(item.receiptUrl!)}
                  activeOpacity={0.8}
                >
                  <Image
                    source={{ uri: item.receiptUrl }}
                    style={styles.receiptPreview}
                  />
                  <View style={styles.receiptOverlay}>
                    <Ionicons name="expand-outline" size={16} color="#fff" />
                    <ThemedText style={styles.receiptOverlayText}>View receipt</ThemedText>
                  </View>
                </TouchableOpacity>
              )}

            </TouchableOpacity>

          )}
        />

      )}

      {/* Receipt modal */}
      <Modal visible={!!viewReceipt} transparent animationType="fade">
        <View style={styles.imageModalOverlay}>
          {viewReceipt && (
            <Image
              source={{ uri: viewReceipt }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          )}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setViewReceipt(null)}
          >
            <Ionicons name="close" size={16} color="#fff" style={{ marginRight: 6 }} />
            <ThemedText style={{ color: "#fff", fontWeight: "600" }}>
              Close
            </ThemedText>
          </TouchableOpacity>
        </View>
      </Modal>

    </ThemedView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#0F172A",
    paddingHorizontal: 20,
    paddingTop: 20
  },

  title: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#F8FAFC",
    marginBottom: 14
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
    marginBottom: 14,
    height: 44
  },

  searchIcon: {
    marginRight: 8
  },

  searchInput: {
    flex: 1,
    color: "#F8FAFC",
    fontSize: 14
  },

  /* Filter tabs */
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16
  },

  filterBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#1E293B",
    gap: 6,
    borderWidth: 1,
    borderColor: "#1E293B"
  },

  filterActive: {
    backgroundColor: "#172554",
    borderColor: "#2563EB"
  },

  filterText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600"
  },

  filterTextActive: {
    color: "#93C5FD",
    fontSize: 12,
    fontWeight: "700"
  },

  countPill: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: "center"
  },

  countPillActive: {
    backgroundColor: "#2563EB"
  },

  countPillInactive: {
    backgroundColor: "#334155"
  },

  countText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700"
  },

  countTextActive: {
    color: "#fff"
  },

  /* Empty state */
  emptyCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12
  },

  emptyText: {
    color: "#475569",
    fontSize: 14
  },

  /* Claim card */
  claimCard: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden"
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6
  },

  amount: {
    fontSize: 20,
    fontWeight: "800",
    color: "#F8FAFC",
    letterSpacing: 0.3
  },

  dateText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500"
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 16,
    paddingBottom: 12
  },

  merchant: {
    color: "#94A3B8",
    fontSize: 13
  },

  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#475569"
  },

  category: {
    color: "#64748B",
    fontSize: 13
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10
  },

  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6
  },

  statusText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5
  },

  badgeApproved:      { backgroundColor: "#052E16" },
  badgePending:       { backgroundColor: "#1C1917" },
  badgeRejected:      { backgroundColor: "#450A0A" },
  badgeTextApproved:  { color: "#4ADE80" },
  badgeTextPending:   { color: "#FCD34D" },
  badgeTextRejected:  { color: "#F87171" },

  /* Paid badge */
  paidBadge: {
    backgroundColor: "#052E16",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#166534"
  },

  paidText: {
    color: "#4ADE80",
    fontSize: 11,
    fontWeight: "700"
  },

  /* Failed payment badge */
  failedBadge: {
    backgroundColor: "#7F1D1D",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#991B1B"
  },

  failedText: {
    color: "#FCA5A5",
    fontSize: 11,
    fontWeight: "700"
  },

  /* Approved/rejected by */
  approvedBy: {
    color: "#4ADE80",
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 8
  },

  rejectedBy: {
    color: "#F87171",
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 8
  },

  /* Admin message bubble */
  messageBubble: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    backgroundColor: "#0F172A",
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#334155"
  },

  messageText: {
    flex: 1,
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18
  },

  /* Receipt */
  receiptPreview: {
    width: "100%",
    height: 130,
    marginTop: 0
  },

  receiptOverlay: {
    position: "absolute",
    bottom: 8,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },

  receiptOverlayText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600"
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },

  /* Receipt modal */
  imageModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },

  fullImage: {
    width: "100%",
    height: "80%"
  },

  closeBtn: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2563EB",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12
  }

});
