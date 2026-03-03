import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";
import { useAuth } from "../context/AuthProvider";
import { db } from "../firebase/firebaseConfig";

const LAST_SEEN_KEY = "claims_last_seen";

type Claim = {
  id: string;
  amount: number;
  merchant: string;
  category: string;
  status: "pending" | "approved" | "rejected";
  createdAt: any;
};

export default function ClaimsScreen() {
  const { user } = useAuth();

  const [allClaims, setAllClaims] = useState<Claim[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [counts, setCounts] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] =
    useState<"pending" | "approved" | "rejected">("pending");

  const [selectedClaim, setSelectedClaim] =
    useState<Claim | null>(null);

  // Mark as seen for badge logic
  useEffect(() => {
    AsyncStorage.setItem(LAST_SEEN_KEY, Date.now().toString());
  }, []);

  // Firestore real-time listener
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "claims"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const data: Claim[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Claim, "id">),
      }));

      setAllClaims(data);

      const tempCounts = {
        pending: 0,
        approved: 0,
        rejected: 0,
      };

      data.forEach((c) => tempCounts[c.status]++);

      setCounts(tempCounts);
      setLoading(false);
      setRefreshing(false);
    });

    return unsub;
  }, [user]);

  // Filter claims by status
  useEffect(() => {
    setClaims(allClaims.filter((c) => c.status === filter));
  }, [filter, allClaims]);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Claims
      </ThemedText>

      {/* Filter Buttons */}
      <View style={styles.filterRow}>
        {["pending", "approved", "rejected"].map((status) => (
          <TouchableOpacity
            key={status}
            onPress={() =>
              setFilter(status as any)
            }
            style={[
              styles.filterBtn,
              filter === status && styles.filterActive,
            ]}
          >
            <ThemedText
              style={
                filter === status
                  ? styles.filterTextActive
                  : styles.filterText
              }
            >
              {status.toUpperCase()} (
              {counts[status as keyof typeof counts]})
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
        </View>
      ) : claims.length === 0 ? (
        <ThemedView style={styles.card}>
          <ThemedText style={{ color: "#94A3B8" }}>
            No {filter} claims
          </ThemedText>
        </ThemedView>
      ) : (
        <FlatList
          data={claims}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#38BDF8"
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setSelectedClaim(item)}
            >
              <ThemedView style={styles.claimCard}>
                <ThemedText style={styles.amount}>
                  £{item.amount.toFixed(2)}
                </ThemedText>

                <ThemedText style={styles.meta}>
                  {item.merchant} • {item.category}
                </ThemedText>

                <ThemedText
                  style={[
                    styles.status,
                    item.status === "pending" &&
                      styles.pending,
                    item.status === "approved" &&
                      styles.approved,
                    item.status === "rejected" &&
                      styles.rejected,
                  ]}
                >
                  {item.status.toUpperCase()}
                </ThemedText>
              </ThemedView>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Modal */}
      <Modal
        visible={!!selectedClaim}
        transparent
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedClaim && (
              <>
                <ThemedText style={styles.modalTitle}>
                  Claim Details
                </ThemedText>

                <ThemedText style={styles.modalAmount}>
                  £{selectedClaim.amount.toFixed(2)}
                </ThemedText>

                <ThemedText style={styles.modalText}>
                  Merchant: {selectedClaim.merchant}
                </ThemedText>

                <ThemedText style={styles.modalText}>
                  Category: {selectedClaim.category}
                </ThemedText>

                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() =>
                    setSelectedClaim(null)
                  }
                >
                  <ThemedText style={{ color: "#fff" }}>
                    Close
                  </ThemedText>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0F172A",
    padding: 20,
    flex: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginTop: 24,
    color: "#F8FAFC",
  },
  filterRow: {
    flexDirection: "row",
    marginVertical: 16,
    gap: 10,
  },
  filterBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "#1E293B",
  },
  filterActive: {
    backgroundColor: "#2563EB",
  },
  filterText: {
    color: "#94A3B8",
    fontSize: 12,
  },
  filterTextActive: {
    color: "#FFFFFF",
    fontSize: 12,
  },
  card: {
    backgroundColor: "rgba(30,41,59,0.95)",
    padding: 18,
    borderRadius: 14,
  },
  claimCard: {
    backgroundColor: "#1E293B",
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
  },
  amount: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#F8FAFC",
  },
  meta: {
    marginTop: 4,
    color: "#94A3B8",
  },
  status: {
    marginTop: 8,
    fontWeight: "700",
  },
  pending: { color: "#FACC15" },
  approved: { color: "#22C55E" },
  rejected: { color: "#EF4444" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#1E293B",
    padding: 20,
    borderRadius: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    color: "#F8FAFC",
  },
  modalAmount: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#38BDF8",
    marginBottom: 12,
  },
  modalText: {
    marginBottom: 8,
    color: "#E2E8F0",
  },
  closeBtn: {
    marginTop: 16,
    backgroundColor: "#2563EB",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
  },
});