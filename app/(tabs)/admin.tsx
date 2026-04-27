import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { usePostHog } from "posthog-react-native";
import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";
import { useAuth } from "../context/AuthProvider";
import { auth, db } from "../firebase/firebaseConfig";
import { addListener } from "../../utils/listenerStore";
import { useTheme } from "../../hooks/useTheme";

const REIMBURSE_URL = process.env.EXPO_PUBLIC_STRIPE_REIMBURSE_URL!;
const NOTIFY_URL    = process.env.EXPO_PUBLIC_NOTIFY_CLAIM_STATUS_URL!;

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
  status?: string;
  approvedBy?: string;
  adminFeedback?: string;
  purchaseDate?: string;
  createdAt?: { toDate?: () => Date; seconds?: number };
  departmentName?: string;
  approvalThreshold?: number;
  l1ApprovedBy?: string;
};

type ConfirmModal = {
  visible: boolean;
  claim: Claim | null;
  action: "approved" | "rejected" | null;
};

type HistoryFilter = "all" | "approved" | "rejected";

export default function AdminScreen() {
  const { role, orgId, user, refreshMembership, isBusiness } = useAuth();
  const posthog = usePostHog();
  const insets = useSafeAreaInsets();
  const { tokens: t, mode } = useTheme();
  const isDark = mode === "dark";

  const [tab, setTab]                         = useState<"pending" | "history">("pending");
  const [claims, setClaims]                   = useState<Claim[]>([]);
  const [historyClaims, setHistoryClaims]     = useState<Claim[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [historyLoading, setHistoryLoading]   = useState(true);
  const [selectedImage, setSelectedImage]     = useState("");
  const [adminMessage, setAdminMessage]       = useState("");
  const [confirmModal, setConfirmModal]       = useState<ConfirmModal>({
    visible: false, claim: null, action: null
  });

  // search and filter state for both tabs
  const [exportLoading, setExportLoading]           = useState(false);
  const [search, setSearch]                         = useState("");
  const [categoryFilter, setCategoryFilter]         = useState<string | null>(null);
  const [historyFilter, setHistoryFilter]           = useState<HistoryFilter>("all");
  const [approvalThreshold, setApprovalThreshold]   = useState<number | null>(null);

  // re-check membership on mount so promotions show up without restarting the app
  useEffect(() => { refreshMembership(); }, []);

  // load the L2 approval threshold if one has been set
  useEffect(() => {
    if (!orgId) return;
    getDocs(query(collection(db, "policies"), where("orgId", "==", orgId), where("type", "==", "approval_required_above")))
      .then(snap => {
        if (!snap.empty) setApprovalThreshold(snap.docs[0].data().value ?? null);
        else setApprovalThreshold(null);
      }).catch(() => {});
  }, [orgId]);

  // real-time listener for pending claims in this org

  useEffect(() => {
    // not an admin yet, clear the spinner so it doesn't hang
    if (role !== "admin" || !orgId || !user?.emailVerified) {
      setLoading(false);
      setHistoryLoading(false);
      return;
    }

    const q = query(
      collection(db, "claims"),
      where("orgId",  "==", orgId),
      where("status", "in", ["pending", "pending_l2"]),
      orderBy("createdAt", "desc")
    );

    const unsub = addListener(onSnapshot(q, (snapshot) => {
      const data: Claim[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Claim, "id">)
      }));
      setClaims(data);
      setLoading(false);
    }, () => {}));

    return unsub;
  }, [role, orgId, user]);

  // real-time listener for approved/rejected claims

  useEffect(() => {
    if (role !== "admin" || !orgId || !user?.emailVerified) return;

    const q = query(
      collection(db, "claims"),
      where("orgId",  "==", orgId),
      where("status", "in", ["approved", "rejected"]),
      orderBy("createdAt", "desc")
    );

    const unsub = addListener(onSnapshot(q, (snapshot) => {
      const data: Claim[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Claim, "id">)
      }));
      setHistoryClaims(data);
      setHistoryLoading(false);
    }, () => {}));

    return unsub;
  }, [role, orgId, user]);

  // filtered and searched lists derived from the raw snapshots

  const pendingCategories = useMemo(
    () => [...new Set(claims.map((c) => c.category))].sort(),
    [claims]
  );

  const filteredPending = useMemo(() => {
    let list = claims;
    if (categoryFilter) list = list.filter((c) => c.category === categoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.merchant.toLowerCase().includes(q) ||
          c.userEmail.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q)
      );
    }
    return list;
  }, [claims, categoryFilter, search]);

  const filteredHistory = useMemo(() => {
    let list = historyClaims;
    if (historyFilter !== "all") list = list.filter((c) => c.status === historyFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.merchant.toLowerCase().includes(q) ||
          c.userEmail.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q)
      );
    }
    return list;
  }, [historyClaims, historyFilter, search]);

  // CSV and PDF export helpers

  function claimToRow(c: Claim) {
    const fmtDate = (val?: string) => val ? new Date(val).toLocaleDateString("en-GB") : "—";
    const fmtCreated = (c: Claim) => {
      if (!c.createdAt) return "—";
      const d = c.createdAt.toDate?.() ?? (c.createdAt.seconds ? new Date(c.createdAt.seconds * 1000) : null);
      return d ? d.toLocaleDateString("en-GB") : "—";
    };
    return {
      claimRef:      c.id.slice(0, 8).toUpperCase(),
      employee:      c.userEmail ?? "—",
      merchant:      c.merchant ?? "—",
      amount:        Number(c.amount).toFixed(2),
      category:      c.category ?? "—",
      department:    c.departmentName ?? "—",
      status:        c.status ?? "—",
      paymentStatus: c.paymentStatus ?? "—",
      approvedBy:    c.approvedBy ?? "—",
      notes:         c.adminFeedback ?? c.description ?? "—",
      purchaseDate:  fmtDate(c.purchaseDate),
      submittedDate: fmtCreated(c),
    };
  }

  async function handleExportCSV() {
    if (exportLoading || filteredHistory.length === 0) return;
    setExportLoading(true);
    try {
      const header = "Reference,Employee,Merchant,Amount (£),Category,Department,Status,Payment Status,Approved By,Notes,Purchase Date,Submitted Date\n";
      const rows = filteredHistory.map(c => {
        const r = claimToRow(c);
        return [r.claimRef, r.employee, r.merchant, r.amount, r.category, r.department, r.status, r.paymentStatus, r.approvedBy, r.notes, r.purchaseDate, r.submittedDate]
          .map(v => `"${String(v).replace(/"/g, '""')}"`)
          .join(",");
      });
      const uri = (FileSystem.documentDirectory ?? "") + "claimio_export.csv";
      await FileSystem.writeAsStringAsync(uri, header + rows.join("\n"), { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Export Claims CSV" });
      } else {
        Alert.alert("Saved", uri);
      }
    } catch (e: any) {
      Alert.alert("Export Error", e?.message ?? "Failed to export.");
    } finally {
      setExportLoading(false);
    }
  }

  async function handleExportPDF() {
    if (exportLoading || filteredHistory.length === 0) return;
    setExportLoading(true);
    try {
      const rows = filteredHistory.map(claimToRow);
      const grandTotal = rows.reduce((s, r) => s + parseFloat(r.amount), 0).toFixed(2);
      const tableRows = rows.map(r => `
        <tr>
          <td>${r.claimRef}</td><td>${r.employee}</td><td>${r.merchant}</td>
          <td>£${r.amount}</td><td>${r.category}</td><td>${r.department}</td>
          <td class="s-${r.status}">${r.status}</td><td>${r.paymentStatus}</td>
          <td>${r.approvedBy}</td><td>${r.notes}</td>
          <td>${r.purchaseDate}</td><td>${r.submittedDate}</td>
        </tr>`).join("");
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
  body{font-family:-apple-system,Helvetica,Arial,sans-serif;margin:28px;color:#0D1B2A;font-size:10px}
  h1{font-size:20px;margin-bottom:4px}
  .meta{color:#6B7A8D;margin:0 0 20px;font-size:10px}
  table{width:100%;border-collapse:collapse}
  th{background:#6366F1;color:#fff;padding:6px 7px;text-align:left;font-size:9px}
  td{padding:5px 7px;border-bottom:1px solid #E8ECF0;font-size:9px}
  tr:nth-child(even) td{background:#F8F9FC}
  .s-approved{color:#16a34a;font-weight:600}
  .s-rejected{color:#dc2626;font-weight:600}
  .total{text-align:right;margin-top:14px;font-weight:700;font-size:12px}
  .footer{margin-top:28px;color:#A0ACBB;font-size:9px;border-top:1px solid #E8ECF0;padding-top:10px}
</style></head><body>
  <h1>Claimio — Expense Report</h1>
  <p class="meta">Generated: ${new Date().toLocaleDateString("en-GB")} &nbsp;·&nbsp; ${rows.length} claim${rows.length !== 1 ? "s" : ""}</p>
  <table><thead><tr>
    <th>Ref</th><th>Employee</th><th>Merchant</th><th>Amount</th><th>Category</th><th>Department</th>
    <th>Status</th><th>Payment</th><th>Approved By</th><th>Notes</th><th>Purchase Date</th><th>Submitted</th>
  </tr></thead><tbody>${tableRows}</tbody></table>
  <p class="total">Total: £${grandTotal}</p>
  <p class="footer">Generated by Claimio. For accounting and tax purposes only.</p>
</body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Export Claims PDF" });
      } else {
        Alert.alert("Saved", uri);
      }
    } catch (e: any) {
      Alert.alert("Export Error", e?.message ?? "Failed to export.");
    } finally {
      setExportLoading(false);
    }
  }

  // opens/closes the approve/reject confirmation modal

  const openConfirmModal  = (claim: Claim, action: "approved" | "rejected") => {
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
    const approvedBy  = currentUser?.displayName || currentUser?.email || "Unknown";
    const adminId     = currentUser?.uid || null;

    // escalate to L2 if approving a pending claim that exceeds the threshold
    if (action === "approved" && claim.status === "pending" && approvalThreshold !== null && claim.amount > approvalThreshold) {
      closeConfirmModal();
      await updateDoc(doc(db, "claims", claim.id), {
        status:        "pending_l2",
        l1ApprovedBy:  approvedBy,
        l1ApprovedAt:  serverTimestamp(),
        adminFeedback: adminMessage.trim() || null,
      });
      currentUser?.getIdToken().then(token => {
        fetch(NOTIFY_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ claimId: claim.id, status: "pending_l2", adminFeedback: adminMessage.trim() || null }),
        }).catch(() => {});
      }).catch(() => {});
      posthog.capture("claim_escalated_to_l2", { amount: claim.amount, category: claim.category });
      Alert.alert("Escalated", `This claim exceeds the £${approvalThreshold} threshold and needs a second approval.`);
      return;
    }

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

    // notify the employee in the background, don't wait on it
    currentUser?.getIdToken().then((token) => {
      fetch(NOTIFY_URL, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({
          claimId:       claim.id,
          status:        action,
          adminFeedback: adminMessage.trim() || null,
        }),
      }).catch(() => {});
    }).catch(() => {});

    if (action === "approved") {
      posthog.capture("claim_approved", {
        amount:   claim.amount,
        category: claim.category,
        reimburse: true,
      });
      try {
        const token = await currentUser?.getIdToken();
        const res   = await fetch(REIMBURSE_URL, {
          method:  "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body:    JSON.stringify({ claimId: claim.id, orgId: claim.orgId })
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
    } else {
      posthog.capture("claim_rejected", {
        amount:   claim.amount,
        category: claim.category,
      });
    }
  };

  // styles (defined before the access guard so hooks are always called in order)

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 20,
      backgroundColor: t.bg
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 16
    },
    title: {
      fontSize: 28,
      fontWeight: "800",
      color: t.text,
      letterSpacing: -1,
      marginBottom: 2
    },
    subtitle: {
      color: t.textTertiary,
      fontSize: 13
    },
    countBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.surfaceAlt,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    countBadgeText: {
      color: t.textSecondary,
      fontSize: 12,
      fontWeight: "600"
    },

    // tab bar
    tabBar: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 14
    },
    tabPill: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: t.surface,
      alignItems: "center",
    },
    tabPillActive: {
      backgroundColor: t.accent,
    },
    tabPillText: {
      color: t.textSecondary,
      fontSize: 13,
      fontWeight: "600"
    },
    tabPillTextActive: {
      color: "#FFFFFF",
      fontWeight: "700"
    },

    // search bar
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.surface,
      borderRadius: 999,
      paddingHorizontal: 16,
      marginBottom: 12,
      height: 46,
      ...(isDark ? {} : {
        shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06, shadowRadius: 6, elevation: 2
      })
    },
    searchInput: {
      flex: 1,
      color: t.text,
      fontSize: 14
    },

    // category filter chips
    chipsScroll: {
      paddingBottom: 10,
      gap: 8,
      flexDirection: "row"
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: t.surface,
    },
    chipActive: {
      backgroundColor: t.accent,
    },
    chipText: {
      color: t.textSecondary,
      fontSize: 13,
      fontWeight: "600"
    },
    chipTextActive: {
      color: "#FFFFFF",
      fontWeight: "700"
    },

    // history status filter
    historyFilterRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 14
    },
    historyFilterBtn: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: t.surface,
      alignItems: "center",
    },
    historyFilterBtnActive: {
      backgroundColor: t.accent,
    },
    historyFilterText: {
      color: t.textSecondary,
      fontSize: 12,
      fontWeight: "600"
    },
    historyFilterTextActive: {
      color: "#FFFFFF",
      fontWeight: "700"
    },
    exportRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 12,
    },
    exportBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: t.surface,
    },
    exportBtnText: {
      color: t.textSecondary,
      fontSize: 12,
      fontWeight: "600",
    },

    // empty state
    emptyState: {
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      paddingTop: 60
    },
    emptyText: {
      color: t.textTertiary,
      fontSize: 14
    },

    // claim card
    card: {
      backgroundColor: t.surface,
      borderRadius: 20,
      marginBottom: 14,
      overflow: "hidden",
      ...(isDark ? {} : {
        shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08, shadowRadius: 12, elevation: 3
      })
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      padding: 18
    },
    amount: {
      fontSize: 22,
      fontWeight: "800",
      color: t.text,
      letterSpacing: -0.5
    },
    merchant: {
      marginTop: 2,
      fontSize: 14,
      color: t.textSecondary,
      fontWeight: "500"
    },
    categoryBadge: {
      backgroundColor: t.surfaceAlt,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    categoryText: {
      color: t.textSecondary,
      fontSize: 12,
      fontWeight: "600"
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.border,
      marginHorizontal: 18
    },
    infoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 18,
      paddingTop: 10
    },
    infoLabel: {
      color: t.textSecondary,
      fontSize: 12,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5
    },
    infoValue: {
      color: t.text,
      fontSize: 12,
      flexShrink: 1,
      textAlign: "right",
      maxWidth: "70%"
    },

    // history status badges
    historyStatusBadge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4
    },
    historyStatusApproved: { backgroundColor: t.successSurface },
    historyStatusRejected: { backgroundColor: t.errorSurface },
    historyStatusText: { fontSize: 11, fontWeight: "700" },
    historyStatusTextApproved: { color: t.success },
    historyStatusTextRejected: { color: t.error },

    // payment badges
    paymentBadge: {
      marginHorizontal: 18,
      marginTop: 10,
      alignSelf: "flex-start",
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4
    },
    paymentBadgePaid: { backgroundColor: t.successSurface },
    paymentBadgeFailed: { backgroundColor: t.errorSurface },
    paymentBadgeText: {
      fontSize: 12,
      fontWeight: "600",
      color: t.text
    },

    // receipt thumbnail
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
      color: t.text,
      fontSize: 12,
      fontWeight: "500"
    },
    noReceiptRow: {
      marginHorizontal: 16,
      marginTop: 10
    },
    noReceipt: {
      color: t.warning,
      fontSize: 12
    },

    // approve and reject buttons
    buttonRow: {
      flexDirection: "row",
      margin: 18,
      gap: 10
    },
    approveBtn: {
      flex: 2,
      backgroundColor: t.success,
      paddingVertical: 13,
      borderRadius: 999,
      alignItems: "center"
    },
    rejectBtn: {
      flex: 1,
      backgroundColor: t.error,
      paddingVertical: 13,
      borderRadius: 999,
      alignItems: "center"
    },
    btnText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 14
    },

    // modal overlay backdrop
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.75)",
      justifyContent: "center",
      padding: 20
    },

    // confirmation modal
    confirmModalContent: {
      backgroundColor: t.surface,
      borderRadius: 24,
      overflow: "hidden",
    },
    confirmTitleBar: {
      paddingVertical: 18,
      paddingHorizontal: 20,
      alignItems: "center"
    },
    confirmTitleBarApprove: { backgroundColor: t.successSurface },
    confirmTitleBarReject: { backgroundColor: t.errorSurface },
    confirmTitle: {
      fontSize: 18,
      fontWeight: "800",
      letterSpacing: -0.5,
      color: t.text
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
      fontSize: 36,
      fontWeight: "800",
      letterSpacing: -1,
      color: t.text
    },
    confirmDetailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center"
    },
    confirmDetailLabel: {
      color: t.textSecondary,
      fontSize: 13,
      fontWeight: "600"
    },
    confirmDetailValue: {
      color: t.text,
      fontSize: 13,
      flexShrink: 1,
      textAlign: "right",
      maxWidth: "65%"
    },
    confirmDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.border,
      marginHorizontal: 20
    },
    messageInput: {
      margin: 20,
      backgroundColor: t.surfaceAlt,
      borderRadius: 16,
      padding: 14,
      color: t.text,
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
      backgroundColor: t.surfaceAlt,
      paddingVertical: 14,
      borderRadius: 999,
      alignItems: "center"
    },
    cancelBtnText: {
      color: t.textSecondary,
      fontWeight: "700",
      fontSize: 14
    },
    confirmBtn: {
      flex: 2,
      paddingVertical: 14,
      borderRadius: 999,
      alignItems: "center"
    },
    confirmBtnApprove: { backgroundColor: t.success },
    confirmBtnReject: { backgroundColor: t.error },
    confirmBtnText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 14
    },

    // receipt image modal
    imageModalContent: {
      backgroundColor: t.surface,
      borderRadius: 24,
      padding: 16
    },
    modalImage: {
      width: "100%",
      height: 400,
      borderRadius: 16
    },
    closeBtn: {
      marginTop: 14,
      backgroundColor: t.accent,
      padding: 14,
      borderRadius: 999,
      alignItems: "center"
    },
    closeBtnText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 14
    },

    // self-claim lock notice
    selfClaimNotice: {
      flexDirection: "row",
      alignItems: "center",
      margin: 18,
      marginTop: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: t.surfaceAlt,
      borderRadius: 12,
    },
    selfClaimText: {
      color: t.textTertiary,
      fontSize: 13,
      fontStyle: "italic"
    },

    // misc
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center"
    },
    denied: {
      marginTop: 40,
      color: t.error,
      fontSize: 18
    }
  }), [t, isDark]);

  if (role !== "admin") {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.denied}>Access Denied</ThemedText>
      </ThemedView>
    );
  }

  const isApprove = confirmModal.action === "approved";

  // search bar component

  const SearchBar = (
    <View style={styles.searchWrap}>
      <Ionicons name="search-outline" size={16} color={t.textSecondary} style={{ marginRight: 8 }} />
      <TextInput
        style={styles.searchInput}
        placeholder="Search merchant, employee, category…"
        placeholderTextColor={t.textTertiary}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      {search.trim() ? (
        <TouchableOpacity onPress={() => setSearch("")}>
          <Ionicons name="close-circle" size={16} color={t.textTertiary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  // category filter chips for the pending tab

  const CategoryChips = pendingCategories.length > 0 ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsScroll}
    >
      <TouchableOpacity
        style={[styles.chip, categoryFilter === null && styles.chipActive]}
        onPress={() => setCategoryFilter(null)}
      >
        <ThemedText style={[styles.chipText, categoryFilter === null && styles.chipTextActive]}>
          All
        </ThemedText>
      </TouchableOpacity>
      {pendingCategories.map((cat) => (
        <TouchableOpacity
          key={cat}
          style={[styles.chip, categoryFilter === cat && styles.chipActive]}
          onPress={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
        >
          <ThemedText style={[styles.chipText, categoryFilter === cat && styles.chipTextActive]}>
            {cat}
          </ThemedText>
        </TouchableOpacity>
      ))}
    </ScrollView>
  ) : null;

  // status filter and export buttons for the history tab

  const HistoryStatusFilter = (
    <View>
      <View style={styles.historyFilterRow}>
        {(["all", "approved", "rejected"] as HistoryFilter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.historyFilterBtn, historyFilter === f && styles.historyFilterBtnActive]}
            onPress={() => setHistoryFilter(f)}
            activeOpacity={0.7}
          >
            <ThemedText style={[
              styles.historyFilterText,
              historyFilter === f && styles.historyFilterTextActive
            ]}>
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>
      {filteredHistory.length > 0 && (
        <View style={styles.exportRow}>
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={handleExportCSV}
            disabled={exportLoading}
            activeOpacity={0.7}
          >
            {exportLoading
              ? <ActivityIndicator size="small" color={t.accent} />
              : <>
                  <Ionicons name="document-text-outline" size={14} color={t.accent} style={{ marginRight: 5 }} />
                  <ThemedText style={styles.exportBtnText}>CSV</ThemedText>
                </>
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={handleExportPDF}
            disabled={exportLoading}
            activeOpacity={0.7}
          >
            {exportLoading
              ? <ActivityIndicator size="small" color={t.accent} />
              : <>
                  <Ionicons name="print-outline" size={14} color={t.accent} style={{ marginRight: 5 }} />
                  <ThemedText style={styles.exportBtnText}>PDF</ThemedText>
                </>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // reusable empty state component

  const EmptyState = ({ message }: { message: string }) => (
    <View style={styles.emptyState}>
      <Ionicons name="receipt-outline" size={36} color={t.border} />
      <ThemedText style={styles.emptyText}>{message}</ThemedText>
    </View>
  );

  // render

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 8 }]}>

      {/* header */}
      <View style={styles.headerRow}>
        <View>
          <ThemedText type="title" style={styles.title}>Admin Panel</ThemedText>
          <ThemedText style={styles.subtitle}>Review & action expense claims</ThemedText>
        </View>
        <View style={styles.countBadge}>
          <Ionicons
            name={tab === "pending" ? "time-outline" : "checkmark-done-outline"}
            size={12} color={t.textSecondary}
            style={{ marginRight: 4 }}
          />
          <ThemedText style={styles.countBadgeText}>
            {tab === "pending"
              ? `${filteredPending.length} pending`
              : `${filteredHistory.length} processed`}
          </ThemedText>
        </View>
      </View>

      {/* tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabPill, tab === "pending" && styles.tabPillActive]}
          onPress={() => { setTab("pending"); setSearch(""); setCategoryFilter(null); }}
          activeOpacity={0.7}
        >
          <ThemedText style={[styles.tabPillText, tab === "pending" && styles.tabPillTextActive]}>
            Pending
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabPill, tab === "history" && styles.tabPillActive]}
          onPress={() => { setTab("history"); setSearch(""); setHistoryFilter("all"); }}
          activeOpacity={0.7}
        >
          <ThemedText style={[styles.tabPillText, tab === "history" && styles.tabPillTextActive]}>
            History
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* search bar */}
      {SearchBar}

      {/* pending tab */}
      {tab === "pending" ? (
        loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={t.accent} /></View>
        ) : (
          <FlatList
            data={filteredPending}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={CategoryChips}
            ListEmptyComponent={
              <EmptyState message={
                search.trim() || categoryFilter
                  ? "No claims match your search"
                  : "No pending claims"
              } />
            }
            renderItem={({ item }) => (
              <ThemedView style={styles.card}>
                <View style={styles.cardHeader}>
                  <View>
                    <ThemedText style={styles.amount}>£{Number(item.amount).toFixed(2)}</ThemedText>
                    <ThemedText style={styles.merchant}>{item.merchant}</ThemedText>
                  </View>
                  <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                    <View style={styles.categoryBadge}>
                      <ThemedText style={styles.categoryText}>{item.category}</ThemedText>
                    </View>
                    {item.status === "pending_l2" && (
                      <View style={[styles.categoryBadge, { backgroundColor: "#7C3AED" + "33" }]}>
                        <ThemedText style={[styles.categoryText, { color: "#A78BFA" }]}>L2 Review</ThemedText>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.infoRow}>
                  <ThemedText style={styles.infoLabel}>Employee</ThemedText>
                  <ThemedText style={styles.infoValue}>{item.userEmail}</ThemedText>
                </View>

                <View style={styles.infoRow}>
                  <ThemedText style={styles.infoLabel}>Category</ThemedText>
                  <ThemedText style={styles.infoValue}>{item.category}</ThemedText>
                </View>

                {item.departmentName ? (
                  <View style={styles.infoRow}>
                    <ThemedText style={styles.infoLabel}>Department</ThemedText>
                    <ThemedText style={styles.infoValue}>{item.departmentName}</ThemedText>
                  </View>
                ) : null}

                {item.description ? (
                  <View style={styles.infoRow}>
                    <ThemedText style={styles.infoLabel}>Note</ThemedText>
                    <ThemedText style={styles.infoValue}>{item.description}</ThemedText>
                  </View>
                ) : null}

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

                {item.receiptUrl ? (
                  <TouchableOpacity
                    style={styles.receiptWrapper}
                    onPress={() => setSelectedImage(item.receiptUrl!)}
                  >
                    <Image source={{ uri: item.receiptUrl }} style={styles.receiptImage} resizeMode="cover" />
                    <View style={styles.receiptOverlay}>
                      <ThemedText style={styles.receiptOverlayText}>Tap to view receipt</ThemedText>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.noReceiptRow}>
                    <ThemedText style={styles.noReceipt}>No receipt attached</ThemedText>
                  </View>
                )}

                {item.userId === user?.uid ? (
                  <View style={styles.selfClaimNotice}>
                    <Ionicons name="lock-closed-outline" size={14} color={t.textTertiary} style={{ marginRight: 6 }} />
                    <ThemedText style={styles.selfClaimText}>You cannot approve your own claim</ThemedText>
                  </View>
                ) : (
                  <View style={styles.buttonRow}>
                    <TouchableOpacity style={styles.approveBtn} onPress={() => openConfirmModal(item, "approved")}>
                      <ThemedText style={styles.btnText} numberOfLines={1}>
                        {item.status === "pending_l2" ? "Final Approve" : "Approve & Pay"}
                      </ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.rejectBtn} onPress={() => openConfirmModal(item, "rejected")}>
                      <ThemedText style={styles.btnText} numberOfLines={1}>Reject</ThemedText>
                    </TouchableOpacity>
                  </View>
                )}
              </ThemedView>
            )}
          />
        )
      ) : (

        /* history tab */
        historyLoading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={t.accent} /></View>
        ) : (
          <FlatList
            data={filteredHistory}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={HistoryStatusFilter}
            ListEmptyComponent={
              <EmptyState message={
                search.trim() || historyFilter !== "all"
                  ? "No claims match your filter"
                  : "No processed claims yet"
              } />
            }
            renderItem={({ item }) => (
              <ThemedView style={styles.card}>
                <View style={styles.cardHeader}>
                  <View>
                    <ThemedText style={styles.amount}>£{Number(item.amount).toFixed(2)}</ThemedText>
                    <ThemedText style={styles.merchant}>{item.merchant}</ThemedText>
                  </View>
                  <View style={[
                    styles.historyStatusBadge,
                    item.status === "approved" ? styles.historyStatusApproved : styles.historyStatusRejected
                  ]}>
                    <ThemedText style={[
                      styles.historyStatusText,
                      item.status === "approved" ? styles.historyStatusTextApproved : styles.historyStatusTextRejected
                    ]}>
                      {item.status?.toUpperCase()}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.infoRow}>
                  <ThemedText style={styles.infoLabel}>Employee</ThemedText>
                  <ThemedText style={styles.infoValue}>{item.userEmail}</ThemedText>
                </View>
                <View style={styles.infoRow}>
                  <ThemedText style={styles.infoLabel}>Category</ThemedText>
                  <ThemedText style={styles.infoValue}>{item.category}</ThemedText>
                </View>

                {item.departmentName ? (
                  <View style={styles.infoRow}>
                    <ThemedText style={styles.infoLabel}>Department</ThemedText>
                    <ThemedText style={styles.infoValue}>{item.departmentName}</ThemedText>
                  </View>
                ) : null}

                {item.approvedBy ? (
                  <View style={styles.infoRow}>
                    <ThemedText style={styles.infoLabel}>
                      {item.status === "approved" ? "Approved By" : "Rejected By"}
                    </ThemedText>
                    <ThemedText style={styles.infoValue}>{item.approvedBy}</ThemedText>
                  </View>
                ) : null}

                {item.l1ApprovedBy ? (
                  <View style={styles.infoRow}>
                    <ThemedText style={styles.infoLabel}>L1 Approved By</ThemedText>
                    <ThemedText style={styles.infoValue}>{item.l1ApprovedBy}</ThemedText>
                  </View>
                ) : null}

                {item.adminFeedback ? (
                  <View style={styles.infoRow}>
                    <ThemedText style={styles.infoLabel}>Feedback</ThemedText>
                    <ThemedText style={styles.infoValue}>{item.adminFeedback}</ThemedText>
                  </View>
                ) : null}

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

                {item.receiptUrl ? (
                  <TouchableOpacity
                    style={styles.receiptWrapper}
                    onPress={() => setSelectedImage(item.receiptUrl!)}
                  >
                    <Image source={{ uri: item.receiptUrl }} style={styles.receiptImage} resizeMode="cover" />
                    <View style={styles.receiptOverlay}>
                      <ThemedText style={styles.receiptOverlayText}>Tap to view receipt</ThemedText>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.noReceiptRow}>
                    <ThemedText style={styles.noReceipt}>No receipt attached</ThemedText>
                  </View>
                )}
              </ThemedView>
            )}
          />
        )
      )}

      {/* confirmation modal */}
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
            <View style={[styles.confirmTitleBar, isApprove ? styles.confirmTitleBarApprove : styles.confirmTitleBarReject]}>
              <ThemedText style={styles.confirmTitle}>
                {isApprove ? "Approve & Pay" : "Reject Claim"}
              </ThemedText>
            </View>

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

            <TextInput
              style={styles.messageInput}
              placeholder="Message to employee (optional)"
              placeholderTextColor={t.textTertiary}
              value={adminMessage}
              onChangeText={setAdminMessage}
              multiline
              numberOfLines={3}
            />

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

      {/* receipt image modal */}
      <Modal visible={!!selectedImage} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.imageModalContent}>
            {selectedImage ? (
              <Image source={{ uri: selectedImage }} style={styles.modalImage} resizeMode="contain" />
            ) : null}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedImage("")}>
              <ThemedText style={styles.closeBtnText}>Close</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </ThemedView>
  );
}
