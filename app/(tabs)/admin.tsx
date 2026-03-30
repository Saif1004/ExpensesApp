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
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";
import { useAuth } from "../context/AuthProvider";
import { auth, db } from "../firebase/firebaseConfig";
import { addListener } from "../../utils/listenerStore";

const REIMBURSE_URL = process.env.EXPO_PUBLIC_STRIPE_REIMBURSE_URL!;

type Claim = {
  id: string;
  amount: number;
  merchant: string;
  category: string;
  userEmail: string;
  userId: string;
  orgId: string;
  description?: string;
  receiptUrl?: string;
  paymentStatus?: string;
};

type ConfirmModal = {
  visible: boolean;
  claim: Claim | null;
  action: "approved" | "rejected" | null;
};

export default function AdminScreen() {
  const { role, orgId, user } = useAuth();

  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>({
    visible: false,
    claim: null,
    action: null
  });

  useEffect(() => {
    // Must scope by orgId — unscoped queries fail Firestore rules
    if (role !== "admin" || !orgId || !user?.emailVerified) return;

    const q = query(
      collection(db, "claims"),
      where("orgId",  "==", orgId),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );

    const unsub = addListener(onSnapshot(q, (snapshot) => {
      const data: Claim[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Claim, "id">)
      }));

      setClaims(data);
      setLoading(false);
    }, () => { /* silently swallow permission-denied on sign-out/delete */ }));

    return unsub;
  }, [role, orgId, user]);

  const openConfirmModal = (claim: Claim, action: "approved" | "rejected") => {
    setAdminMessage("");
    setConfirmModal({ visible: true, claim, action });
  };

  const closeConfirmModal = () => {
    setConfirmModal({ visible: false, claim: null, action: null });
    setAdminMessage("");
  };

  const handleConfirm = async () => {
    const { claim, action } = confirmModal;
    if (!claim || !action) return;

    const currentUser = auth.currentUser;
    const approvedBy = currentUser?.displayName || currentUser?.email || "Unknown";
    const adminId = currentUser?.uid || null;

    closeConfirmModal();

    await updateDoc(doc(db, "claims", claim.id), {
      status:          action,
      statusUpdatedAt: serverTimestamp(),
      approvedBy,
      adminId,
      adminFeedback:   adminMessage.trim() || null,
      ...(action === "approved"
        ? { approvedAt: serverTimestamp() }
        : { rejectedAt: serverTimestamp() }),
    });

    if (action === "approved") {
      try {
        const token = await currentUser?.getIdToken();
        const res = await fetch(REIMBURSE_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ claimId: claim.id, orgId: claim.orgId })
        });
        const data = await res.json();
        if (data.error) {
          Alert.alert(
            "Claim Approved",
            `Claim approved but payment failed: ${data.error}\n\nCheck that both you and the employee have set up payment accounts.`
          );
        }
      } catch (err: any) {
        Alert.alert("Payment Error", err.message);
      }
    }
  };

  if (role !== "admin") {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.denied}>Access Denied</ThemedText>
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

  const isApprove = confirmModal.action === "approved";

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <ThemedText type="title" style={styles.title}>Admin Panel</ThemedText>
        <View style={styles.countBadge}>
          <ThemedText style={styles.countBadgeText}>{claims.length} pending</ThemedText>
        </View>
      </View>

      <FlatList
        data={claims}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <ThemedView style={styles.card}>
            {/* Card header */}
            <View style={styles.cardHeader}>
              <View>
                <ThemedText style={styles.amount}>
                  £{Number(item.amount).toFixed(2)}
                </ThemedText>
                <ThemedText style={styles.merchant}>{item.merchant}</ThemedText>
              </View>
              <View style={styles.categoryBadge}>
                <ThemedText style={styles.categoryText}>{item.category}</ThemedText>
              </View>
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Email row */}
            <View style={styles.infoRow}>
              <ThemedText style={styles.infoLabel}>Employee</ThemedText>
              <ThemedText style={styles.infoValue}>{item.userEmail}</ThemedText>
            </View>

            {item.description ? (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Note</ThemedText>
                <ThemedText style={styles.infoValue}>{item.description}</ThemedText>
              </View>
            ) : null}

            {/* Payment status badge */}
            {item.paymentStatus === "paid" && (
              <View style={[styles.paymentBadge, styles.paymentBadgePaid]}>
                <ThemedText style={styles.paymentBadgeText}>💳 Paid</ThemedText>
              </View>
            )}
            {item.paymentStatus === "failed" && (
              <View style={[styles.paymentBadge, styles.paymentBadgeFailed]}>
                <ThemedText style={styles.paymentBadgeText}>⚠️ Payment Failed</ThemedText>
              </View>
            )}

            {/* Receipt */}
            {item.receiptUrl ? (
              <TouchableOpacity
                style={styles.receiptWrapper}
                onPress={() => setSelectedImage(item.receiptUrl!)}
              >
                <Image
                  source={{ uri: item.receiptUrl }}
                  style={styles.receiptImage}
                  resizeMode="cover"
                />
                <View style={styles.receiptOverlay}>
                  <ThemedText style={styles.receiptOverlayText}>Tap to view receipt</ThemedText>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.noReceiptRow}>
                <ThemedText style={styles.noReceipt}>No receipt attached</ThemedText>
              </View>
            )}

            {/* Action buttons */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.approveBtn}
                onPress={() => openConfirmModal(item, "approved")}
              >
                <ThemedText style={styles.btnText} numberOfLines={1}>Approve & Pay</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.rejectBtn}
                onPress={() => openConfirmModal(item, "rejected")}
              >
                <ThemedText style={styles.btnText} numberOfLines={1}>Reject</ThemedText>
              </TouchableOpacity>
            </View>
          </ThemedView>
        )}
      />

      {/* ── Confirmation Modal ── */}
      <Modal
        visible={confirmModal.visible}
        transparent
        animationType="fade"
        onRequestClose={closeConfirmModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.confirmModalContent}>
            {/* Modal title */}
            <View style={[styles.confirmTitleBar, isApprove ? styles.confirmTitleBarApprove : styles.confirmTitleBarReject]}>
              <ThemedText style={styles.confirmTitle}>
                {isApprove ? "Approve & Pay" : "Reject Claim"}
              </ThemedText>
            </View>

            {/* Claim details */}
            {confirmModal.claim && (
              <View style={styles.confirmDetails}>
                <View style={styles.confirmAmountRow}>
                  <ThemedText style={styles.confirmAmount}>
                    £{Number(confirmModal.claim.amount).toFixed(2)}
                  </ThemedText>
                </View>

                <View style={styles.confirmDetailRow}>
                  <ThemedText style={styles.confirmDetailLabel}>Merchant</ThemedText>
                  <ThemedText style={styles.confirmDetailValue}>{confirmModal.claim.merchant}</ThemedText>
                </View>
                <View style={styles.confirmDetailRow}>
                  <ThemedText style={styles.confirmDetailLabel}>Category</ThemedText>
                  <ThemedText style={styles.confirmDetailValue}>{confirmModal.claim.category}</ThemedText>
                </View>
                <View style={styles.confirmDetailRow}>
                  <ThemedText style={styles.confirmDetailLabel}>Employee</ThemedText>
                  <ThemedText style={styles.confirmDetailValue}>{confirmModal.claim.userEmail}</ThemedText>
                </View>
              </View>
            )}

            <View style={styles.confirmDivider} />

            {/* Message input */}
            <TextInput
              style={styles.messageInput}
              placeholder="Message to employee (optional)"
              placeholderTextColor="#475569"
              value={adminMessage}
              onChangeText={setAdminMessage}
              multiline
              numberOfLines={3}
            />

            {/* Action buttons */}
            <View style={styles.confirmButtonRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeConfirmModal}>
                <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmBtn, isApprove ? styles.confirmBtnApprove : styles.confirmBtnReject]}
                onPress={handleConfirm}
              >
                <ThemedText style={styles.confirmBtnText} numberOfLines={1}>
                  {isApprove ? "Approve & Pay" : "Reject"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Receipt image Modal ── */}
      <Modal visible={!!selectedImage} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.imageModalContent}>
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
              <ThemedText style={styles.closeBtnText}>Close</ThemedText>
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
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: "#0F172A"
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 20
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#F8FAFC"
  },
  countBadge: {
    backgroundColor: "#1E293B",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#334155"
  },
  countBadgeText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600"
  },

  /* Card */
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#334155"
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 16
  },
  amount: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#F8FAFC"
  },
  merchant: {
    marginTop: 2,
    fontSize: 14,
    color: "#94A3B8"
  },
  categoryBadge: {
    backgroundColor: "#0F172A",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#2563EB"
  },
  categoryText: {
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: "600"
  },
  divider: {
    height: 1,
    backgroundColor: "#334155",
    marginHorizontal: 16
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10
  },
  infoLabel: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  infoValue: {
    color: "#CBD5E1",
    fontSize: 12,
    flexShrink: 1,
    textAlign: "right",
    maxWidth: "70%"
  },

  /* Payment status badges */
  paymentBadge: {
    marginHorizontal: 16,
    marginTop: 10,
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  paymentBadgePaid: {
    backgroundColor: "#14532D"
  },
  paymentBadgeFailed: {
    backgroundColor: "#7F1D1D"
  },
  paymentBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#F8FAFC"
  },

  /* Receipt */
  receiptWrapper: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative"
  },
  receiptImage: {
    width: "100%",
    height: 160,
    borderRadius: 10
  },
  receiptOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    padding: 6,
    alignItems: "center"
  },
  receiptOverlayText: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "500"
  },
  noReceiptRow: {
    marginHorizontal: 16,
    marginTop: 10
  },
  noReceipt: {
    color: "#F97316",
    fontSize: 12
  },

  /* Action buttons */
  buttonRow: {
    flexDirection: "row",
    margin: 16,
    gap: 10
  },
  approveBtn: {
    flex: 2,
    backgroundColor: "#16A34A",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center"
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: "#DC2626",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center"
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14
  },

  /* Shared modal overlay */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    padding: 20
  },

  /* Confirmation modal */
  confirmModalContent: {
    backgroundColor: "#1E293B",
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#334155"
  },
  confirmTitleBar: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center"
  },
  confirmTitleBarApprove: {
    backgroundColor: "#14532D"
  },
  confirmTitleBarReject: {
    backgroundColor: "#7F1D1D"
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#F8FAFC"
  },
  confirmDetails: {
    padding: 20,
    gap: 10
  },
  confirmAmountRow: {
    alignItems: "center",
    marginBottom: 6
  },
  confirmAmount: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#F8FAFC"
  },
  confirmDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  confirmDetailLabel: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "600"
  },
  confirmDetailValue: {
    color: "#CBD5E1",
    fontSize: 13,
    flexShrink: 1,
    textAlign: "right",
    maxWidth: "65%"
  },
  confirmDivider: {
    height: 1,
    backgroundColor: "#334155",
    marginHorizontal: 20
  },
  messageInput: {
    margin: 20,
    backgroundColor: "#0F172A",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 12,
    color: "#F8FAFC",
    fontSize: 14,
    textAlignVertical: "top",
    minHeight: 72
  },
  confirmButtonRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 10
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#334155",
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center"
  },
  cancelBtnText: {
    color: "#94A3B8",
    fontWeight: "700",
    fontSize: 14
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center"
  },
  confirmBtnApprove: {
    backgroundColor: "#16A34A"
  },
  confirmBtnReject: {
    backgroundColor: "#DC2626"
  },
  confirmBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14
  },

  /* Receipt image modal */
  imageModalContent: {
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
    padding: 13,
    borderRadius: 12,
    alignItems: "center"
  },
  closeBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14
  },

  /* Misc */
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  denied: {
    marginTop: 40,
    color: "#EF4444",
    fontSize: 18
  }
});
