import {
    collection,
    doc,
    onSnapshot,
    orderBy,
    query,
    updateDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";
import { useAuth } from "../context/AuthProvider";
import { db } from "../firebase/firebaseConfig";

type Claim = {
  id: string;
  amount: number;
  merchant: string;
  category: string;
  userEmail: string;
  status: "pending" | "approved" | "rejected";
};

export default function AdminScreen() {
  const { role } = useAuth();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role !== "admin") return;

    const q = query(
      collection(db, "claims"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Claim[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Claim, "id">),
      }));

      setClaims(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [role]);

  const updateStatus = async (id: string, status: "approved" | "rejected") => {
    await updateDoc(doc(db, "claims", id), { status });
  };

  if (role !== "admin") {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.denied}>
          Access Denied
        </ThemedText>
      </ThemedView>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#38BDF8" />
      </View>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Admin Panel
      </ThemedText>

      <FlatList
        data={claims}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ThemedView style={styles.card}>
            <ThemedText style={styles.amount}>
              £{item.amount.toFixed(2)}
            </ThemedText>

            <ThemedText style={styles.meta}>
              {item.merchant} • {item.category}
            </ThemedText>

            <ThemedText style={styles.userEmail}>
              {item.userEmail}
            </ThemedText>

            <ThemedText
              style={[
                styles.status,
                item.status === "pending" && styles.pending,
                item.status === "approved" && styles.approved,
                item.status === "rejected" && styles.rejected,
              ]}
            >
              {item.status.toUpperCase()}
            </ThemedText>

            {item.status === "pending" && (
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.approveBtn}
                  onPress={() => updateStatus(item.id, "approved")}
                >
                  <ThemedText style={styles.btnText}>
                    Approve
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => updateStatus(item.id, "rejected")}
                >
                  <ThemedText style={styles.btnText}>
                    Reject
                  </ThemedText>
                </TouchableOpacity>
              </View>
            )}
          </ThemedView>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#0F172A",
  },
  title: {
    marginTop: 24,
    fontSize: 28,
    fontWeight: "bold",
  },
  card: {
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
  userEmail: {
    marginTop: 4,
    color: "#64748B",
    fontSize: 12,
  },
  status: {
    marginTop: 8,
    fontWeight: "700",
  },
  pending: {
    color: "#FACC15",
  },
  approved: {
    color: "#22C55E",
  },
  rejected: {
    color: "#EF4444",
  },
  buttonRow: {
    flexDirection: "row",
    marginTop: 10,
    gap: 10,
  },
  approveBtn: {
    backgroundColor: "#16A34A",
    padding: 10,
    borderRadius: 10,
  },
  rejectBtn: {
    backgroundColor: "#DC2626",
    padding: 10,
    borderRadius: 10,
  },
  btnText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  denied: {
    marginTop: 40,
    color: "#EF4444",
    fontSize: 18,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});