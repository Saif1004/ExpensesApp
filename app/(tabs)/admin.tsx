import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View
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
  receiptUrl?: string;
};

export default function AdminScreen() {
  const { role } = useAuth();

  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState("");

  useEffect(() => {
    if (role !== "admin") return;

    const q = query(
      collection(db, "claims"),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const data: Claim[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Claim, "id">)
      }));

      setClaims(data);
      setLoading(false);
    });

    return unsub;
  }, [role]);

  const updateStatus = async (id: string, status: "approved" | "rejected") => {
    await updateDoc(doc(db, "claims", id), {
      status,
      statusUpdatedAt: serverTimestamp()
    });
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
              £{Number(item.amount).toFixed(2)}
            </ThemedText>

            <ThemedText style={styles.meta}>
              {item.merchant} • {item.category}
            </ThemedText>

            <ThemedText style={styles.userEmail}>
              {item.userEmail}
            </ThemedText>

            {item.receiptUrl ? (
              <TouchableOpacity onPress={() => setSelectedImage(item.receiptUrl!)}>
                <Image
                  source={{ uri: item.receiptUrl }}
                  style={styles.receiptImage}
                  resizeMode="contain"
                />
                <ThemedText style={styles.imageHint}>
                  Tap to view receipt
                </ThemedText>
              </TouchableOpacity>
            ) : (
              <ThemedText style={styles.noReceipt}>
                No receipt attached
              </ThemedText>
            )}

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
          </ThemedView>
        )}
      />

      <Modal visible={!!selectedImage} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedImage ? (
              <Image
                source={{ uri: selectedImage }}
                style={styles.modalImage}
                resizeMode="contain"
              />
            ) : null}

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setSelectedImage("")}
            >
              <ThemedText style={{ color: "#fff", fontWeight: "600" }}>
                Close
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#0F172A"
  },
  title: {
    marginTop: 24,
    fontSize: 28,
    fontWeight: "bold",
    color: "#F8FAFC"
  },
  card: {
    backgroundColor: "#1E293B",
    padding: 16,
    borderRadius: 14,
    marginBottom: 14
  },
  amount: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#F8FAFC"
  },
  meta: {
    marginTop: 4,
    color: "#94A3B8"
  },
  userEmail: {
    marginTop: 4,
    color: "#64748B",
    fontSize: 12
  },
  receiptImage: {
    width: "100%",
    height: 180,
    marginTop: 10,
    borderRadius: 10
  },
  imageHint: {
    color: "#94A3B8",
    marginTop: 6,
    fontSize: 12,
    textAlign: "center"
  },
  noReceipt: {
    color: "#F97316",
    marginTop: 10
  },
  buttonRow: {
    flexDirection: "row",
    marginTop: 12,
    gap: 10
  },
  approveBtn: {
    backgroundColor: "#16A34A",
    padding: 10,
    borderRadius: 10
  },
  rejectBtn: {
    backgroundColor: "#DC2626",
    padding: 10,
    borderRadius: 10
  },
  btnText: {
    color: "#fff",
    fontWeight: "600"
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  denied: {
    marginTop: 40,
    color: "#EF4444",
    fontSize: 18
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    padding: 20
  },
  modalContent: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 16
  },
  modalImage: {
    width: "100%",
    height: 400,
    borderRadius: 12
  },
  closeBtn: {
    marginTop: 16,
    backgroundColor: "#2563EB",
    padding: 12,
    borderRadius: 12,
    alignItems: "center"
  }
});