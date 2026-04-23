import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where
} from "firebase/firestore";

import { useEffect, useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
import { useTheme } from "../../hooks/useTheme";

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

// formats a firestore timestamp as "27 Mar"

function formatDate(ts: Timestamp): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun",
                  "Jul","Aug","Sep","Oct","Nov","Dec"];
  const d = ts.toDate();
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export default function ClaimsScreen() {

  const { user } = useAuth();
  const { tokens: t, mode } = useTheme();
  const isDark = mode === "dark";
  const insets = useSafeAreaInsets();

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

  // mark claims as seen so the badge clears

  useEffect(() => {
    AsyncStorage.setItem(LAST_SEEN_KEY, Date.now().toString());
  }, []);

  // subscribe to the user's claims in real time

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

    }, () => { /* ignore permission errors on sign-out */ }));

    return unsub;

  }, [user]);

  // apply the active tab filter and search query

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

  // pull-to-refresh handler

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  // colours and icons for each claim status

  const STATUS_CONFIG = {
    pending:  { color: t.warning,  bg: t.warningSurface,  icon: "time-outline" as const },
    approved: { color: t.success,  bg: t.successSurface,  icon: "checkmark-circle-outline" as const },
    rejected: { color: t.error,    bg: t.errorSurface,    icon: "close-circle-outline" as const },
  };

  // returns the right badge style for a given status

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

  // styles

  const styles = useMemo(() => StyleSheet.create({

    container: {
      flex: 1,
      backgroundColor: t.bg,
      paddingHorizontal: 20,
      paddingTop: insets.top + 12
    },

    title: {
      fontSize: 28,
      fontWeight: "800",
      color: t.text,
      letterSpacing: -1,
      marginBottom: 16
    },

    // search bar
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.surface,
      borderRadius: 999,
      paddingHorizontal: 16,
      marginBottom: 14,
      height: 46,
      ...(isDark ? {} : {
        shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06, shadowRadius: 6, elevation: 2
      })
    },

    searchIcon: {
      marginRight: 8
    },

    searchInput: {
      flex: 1,
      color: t.text,
      fontSize: 14
    },

    // filter tabs
    filterRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 18
    },

    filterBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 9,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: t.surface,
      gap: 6,
    },

    filterActive: {
      backgroundColor: t.accent,
    },

    filterText: {
      color: t.textSecondary,
      fontSize: 12,
      fontWeight: "600"
    },

    filterTextActive: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "700"
    },

    countPill: {
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 1,
      minWidth: 20,
      alignItems: "center"
    },

    countPillActive: {
      backgroundColor: "rgba(255,255,255,0.25)"
    },

    countPillInactive: {
      backgroundColor: t.surfaceAlt
    },

    countText: {
      color: t.textSecondary,
      fontSize: 11,
      fontWeight: "700"
    },

    countTextActive: {
      color: "#FFFFFF"
    },

    // empty state
    emptyCard: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 12
    },

    emptyText: {
      color: t.textTertiary,
      fontSize: 14
    },

    // claim card
    claimCard: {
      backgroundColor: t.surface,
      borderRadius: 20,
      marginBottom: 12,
      overflow: "hidden",
      ...(isDark ? {} : {
        shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08, shadowRadius: 12, elevation: 3
      })
    },

    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 6
    },

    amount: {
      fontSize: 22,
      fontWeight: "800",
      color: t.text,
      letterSpacing: -0.5
    },

    dateText: {
      fontSize: 12,
      color: t.textTertiary,
      fontWeight: "500"
    },

    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 18,
      paddingBottom: 12
    },

    merchant: {
      color: t.textSecondary,
      fontSize: 13,
      fontWeight: "500"
    },

    dot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: t.textTertiary
    },

    category: {
      color: t.textTertiary,
      fontSize: 13
    },

    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 18,
      paddingBottom: 14
    },

    statusBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999
    },

    statusText: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.3
    },

    badgeApproved:      { backgroundColor: t.successSurface },
    badgePending:       { backgroundColor: t.warningSurface },
    badgeRejected:      { backgroundColor: t.errorSurface },
    badgeTextApproved:  { color: t.success },
    badgeTextPending:   { color: t.warning },
    badgeTextRejected:  { color: t.error },

    // paid badge
    paidBadge: {
      backgroundColor: t.successSurface,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },

    paidText: {
      color: t.success,
      fontSize: 11,
      fontWeight: "700"
    },

    // failed payment badge
    failedBadge: {
      backgroundColor: t.errorSurface,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },

    failedText: {
      color: t.error,
      fontSize: 11,
      fontWeight: "700"
    },

    // approved/rejected by line
    approvedBy: {
      color: t.success,
      fontSize: 12,
      paddingHorizontal: 18,
      paddingBottom: 8
    },

    rejectedBy: {
      color: t.error,
      fontSize: 12,
      paddingHorizontal: 18,
      paddingBottom: 8
    },

    // admin message bubble
    messageBubble: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 7,
      backgroundColor: t.surfaceAlt,
      marginHorizontal: 18,
      marginBottom: 14,
      borderRadius: 12,
      padding: 10,
    },

    messageText: {
      flex: 1,
      color: t.textSecondary,
      fontSize: 13,
      lineHeight: 18
    },

    // receipt thumbnail
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
      borderRadius: 999
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

    // fullscreen receipt modal
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
      marginTop: 20,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.accent,
      paddingHorizontal: 28,
      paddingVertical: 14,
      borderRadius: 999
    }

  }), [t, isDark, insets]);

  // render

  return (
    <ThemedView style={styles.container}>

      {/* title */}
      <ThemedText type="title" style={styles.title}>
        My Claims
      </ThemedText>

      {/* search bar */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={t.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by merchant or category…"
          placeholderTextColor={t.textTertiary}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {/* filter tabs */}
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

      {/* main content area */}
      {loading ? (

        <View style={styles.center}>
          <ActivityIndicator size="large" color={t.accent} />
        </View>

      ) : claims.length === 0 ? (

        <View style={styles.emptyCard}>
          <Ionicons name="receipt-outline" size={36} color={t.border} />
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
              tintColor={t.accent}
            />
          }
          renderItem={({ item }) => (

            <TouchableOpacity
              style={styles.claimCard}
              onPress={() => router.push(`/claims/${item.id}`)}
              activeOpacity={0.75}
            >

              {/* amount and date */}
              <View style={styles.cardHeader}>
                <ThemedText style={styles.amount}>
                  £{item.amount.toFixed(2)}
                </ThemedText>
                <ThemedText style={styles.dateText}>
                  {item.createdAt ? formatDate(item.createdAt) : ""}
                </ThemedText>
              </View>

              {/* merchant and category */}
              <View style={styles.metaRow}>
                <Ionicons name="storefront-outline" size={13} color={t.textSecondary} />
                <ThemedText style={styles.merchant}>{item.merchant}</ThemedText>
                <View style={styles.dot} />
                <ThemedText style={styles.category}>{item.category}</ThemedText>
              </View>

              {/* status badge row */}
              <View style={styles.statusRow}>
                <View style={[styles.statusBadge, getStatusStyle(item.status)]}>
                  <ThemedText style={[styles.statusText, getStatusTextStyle(item.status)]}>
                    {item.status.toUpperCase()}
                  </ThemedText>
                </View>

                {/* reimbursed pill */}
                {item.paymentStatus === "paid" && (
                  <View style={styles.paidBadge}>
                    <ThemedText style={styles.paidText}>💳 Reimbursed</ThemedText>
                  </View>
                )}

                {/* payment failed pill */}
                {item.paymentStatus === "failed" && (
                  <View style={styles.failedBadge}>
                    <ThemedText style={styles.failedText}>⚠️ Payment Failed</ThemedText>
                  </View>
                )}
              </View>

              {/* who approved or rejected it */}
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

              {/* admin feedback message */}
              {!!item.adminFeedback && (
                <View style={styles.messageBubble}>
                  <Ionicons name="chatbubble-outline" size={13} color={t.textSecondary} style={{ marginTop: 1 }} />
                  <ThemedText style={styles.messageText}>
                    {item.adminFeedback}
                  </ThemedText>
                </View>
              )}

              {/* receipt thumbnail, tap to expand */}
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

      {/* fullscreen receipt modal */}
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
            <ThemedText style={{ color: "#fff", fontWeight: "700" }}>
              Close
            </ThemedText>
          </TouchableOpacity>
        </View>
      </Modal>

    </ThemedView>
  );
}
