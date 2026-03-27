import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signOut
} from "firebase/auth";

import { doc, getDoc, updateDoc } from "firebase/firestore";

import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { auth, db } from "../../app/firebase/firebaseConfig";
import { ThemedText } from "../../components/themed-text";
import { useAuth } from "../context/AuthProvider";
import { unsubscribeAll } from "../../utils/listenerStore";

const DELETE_URL = process.env.EXPO_PUBLIC_DELETE_ACCOUNT_URL!;

//////////////////////////////////////////////////////
// Types
//////////////////////////////////////////////////////

type PaymentInfo = {
  stripeCardBrand?: string;
  stripeCardLast4?: string;
  stripePayoutBrand?: string;
  stripePayoutLast4?: string;
};

//////////////////////////////////////////////////////
// Helper: format card info
//////////////////////////////////////////////////////

function formatCard(brand?: string, last4?: string): string | null {
  if (!brand || !last4) return null;
  return `${brand.toUpperCase()} \u2022\u2022\u2022\u2022 ${last4}`;
}

//////////////////////////////////////////////////////
// Sub-components
//////////////////////////////////////////////////////

function SectionHeader({ label }: { label: string }) {
  return (
    <ThemedText style={styles.sectionHeader}>{label}</ThemedText>
  );
}

type MenuRowProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  sublabel?: string | null;
  onPress?: () => void;
  danger?: boolean;
  chevron?: boolean;
  rightElement?: React.ReactNode;
  isFirst?: boolean;
  isLast?: boolean;
};

function MenuRow({
  icon,
  label,
  sublabel,
  onPress,
  danger = false,
  chevron = true,
  rightElement,
  isFirst = false,
  isLast = false
}: MenuRowProps) {
  return (
    <TouchableOpacity
      style={[
        styles.menuRow,
        isFirst && styles.menuRowFirst,
        isLast && styles.menuRowLast,
        !isLast && styles.menuRowBorder
      ]}
      onPress={onPress}
      activeOpacity={0.65}
      disabled={!onPress}
    >
      {/* Left icon */}
      <View style={[styles.iconWrap, danger && styles.iconWrapDanger]}>
        <Ionicons
          name={icon}
          size={18}
          color={danger ? "#F87171" : "#38BDF8"}
        />
      </View>

      {/* Label block */}
      <View style={styles.menuLabelBlock}>
        <ThemedText style={[styles.menuLabel, danger && styles.menuLabelDanger]}>
          {label}
        </ThemedText>
        {!!sublabel && (
          <ThemedText style={styles.menuSublabel}>{sublabel}</ThemedText>
        )}
      </View>

      {/* Right side */}
      {rightElement
        ? rightElement
        : chevron && (
          <Ionicons name="chevron-forward" size={16} color="#475569" />
        )
      }
    </TouchableOpacity>
  );
}

//////////////////////////////////////////////////////
// Main screen
//////////////////////////////////////////////////////

export default function ProfileScreen() {

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { role, orgPlan, trialDaysLeft, orgId } = useAuth();

  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>({});
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const user = auth.currentUser;

  //////////////////////////////////////////////////////
  // LOAD USER DATA
  //////////////////////////////////////////////////////

  useEffect(() => {
    const loadUser = async () => {
      try {
        if (!user) { setLoading(false); return; }
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const data = snap.data();
          setUsername(data.username ?? "");
          setPaymentInfo({
            stripeCardBrand:   data.stripeCardBrand,
            stripeCardLast4:   data.stripeCardLast4,
            stripePayoutBrand: data.stripePayoutBrand,
            stripePayoutLast4: data.stripePayoutLast4
          });
        }

      } catch (err) {
        console.log("User load error:", err);
      }
      setLoading(false);
    };
    loadUser();
  }, []);

  //////////////////////////////////////////////////////
  // RESET PASSWORD
  //////////////////////////////////////////////////////

  const resetPassword = async () => {
    if (!user?.email) {
      Alert.alert("Error", "No email associated with this account.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, user.email);
      Alert.alert("Password Reset", "Check your email to reset your password.");
    } catch {
      Alert.alert("Error", "Could not send reset email");
    }
  };

  //////////////////////////////////////////////////////
  // DELETE ACCOUNT
  //////////////////////////////////////////////////////

  const openDeleteModal = () => {
    setDeletePassword("");
    setDeleteError("");
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!user?.email) return;

    if (!deletePassword.trim()) {
      setDeleteError("Please enter your password.");
      return;
    }

    setDeleting(true);
    setDeleteError("");

    try {
      const credential = EmailAuthProvider.credential(user.email, deletePassword);
      await reauthenticateWithCredential(user, credential);

      const token = await user.getIdToken(true);

      const res = await fetch(DELETE_URL, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Server error");
      }

      unsubscribeAll();
      await signOut(auth);
      router.replace("/");

    } catch (err: any) {
      const code = err?.code ?? "";
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setDeleteError("Incorrect password. Please try again.");
      } else if (code === "auth/too-many-requests") {
        setDeleteError("Too many attempts. Please try again later.");
      } else if (code === "auth/network-request-failed") {
        setDeleteError("Network error. Check your connection.");
      } else {
        setDeleteError("Something went wrong. Please try again.");
      }
    } finally {
      setDeleting(false);
    }
  };

  //////////////////////////////////////////////////////
  // LOG OUT
  //////////////////////////////////////////////////////

  const logout = async () => {
    try {
      setLoggingOut(true);
      unsubscribeAll();
      await signOut(auth);
      router.replace("/");
    } catch {
      Alert.alert("Error", "Could not log out");
    } finally {
      setLoggingOut(false);
    }
  };

  //////////////////////////////////////////////////////
  // SHARE INVITE CODE
  //////////////////////////////////////////////////////

  const [generatingCode, setGeneratingCode] = useState(false);

  const generateCode = async () => {
    if (!orgId) return;
    setGeneratingCode(true);
    try {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const newCode = Array.from({ length: 6 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
      ).join("");
      await updateDoc(doc(db, "organisations", orgId), { inviteCode: newCode });
      setInviteCode(newCode);
    } catch {
      Alert.alert("Error", "Could not generate a code. Try again.");
    } finally {
      setGeneratingCode(false);
    }
  };

  const shareCode = async () => {
    if (!inviteCode) return;
    const formatted = `${inviteCode.slice(0, 3)}-${inviteCode.slice(3)}`;
    try {
      await Share.share({
        message: `Join our organisation on Claimio!\n\nInvite code: ${formatted}\n\nDownload Claimio, tap "Join Organisation" and enter this code.`
      });
    } catch {
      console.log("Share cancelled");
    }
  };

  //////////////////////////////////////////////////////
  // LOADING STATE
  //////////////////////////////////////////////////////

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#38BDF8" />
      </View>
    );
  }

  //////////////////////////////////////////////////////
  // Derived values
  //////////////////////////////////////////////////////

  const initials = username?.charAt(0)?.toUpperCase() || "U";

  const planLabel =
    orgPlan === "free"   ? "Free" :
    orgPlan === "trial"  ? `Trial · ${trialDaysLeft}d left` :
    orgPlan.charAt(0).toUpperCase() + orgPlan.slice(1);

  const planCardTitle =
    orgPlan === "free"   ? "Start your free trial" :
    orgPlan === "trial"  ? "Upgrade to keep access" :
    "Manage subscription";

  const planCardSub =
    orgPlan === "free"   ? "7 days of Pro features, no payment needed" :
    orgPlan === "trial"  ? `${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} remaining on trial` :
    `You're on the ${orgPlan.charAt(0).toUpperCase() + orgPlan.slice(1)} plan`;

  const cardInfoLabel  = formatCard(paymentInfo.stripeCardBrand,   paymentInfo.stripeCardLast4);
  const payoutInfoLabel = formatCard(paymentInfo.stripePayoutBrand, paymentInfo.stripePayoutLast4);

  //////////////////////////////////////////////////////
  // UI
  //////////////////////////////////////////////////////

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── AVATAR SECTION ── */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <ThemedText style={styles.avatarText}>{initials}</ThemedText>
            </View>
          </View>

          <ThemedText style={styles.name}>{username || "User"}</ThemedText>
          <ThemedText style={styles.email}>{user?.email}</ThemedText>

          <View style={styles.badgeRow}>
            {/* Role badge */}
            <View style={[
              styles.roleBadge,
              role === "admin" ? styles.roleBadgeAdmin : styles.roleBadgeEmployee
            ]}>
              <ThemedText style={[
                styles.roleBadgeText,
                role === "admin" ? styles.roleBadgeTextAdmin : styles.roleBadgeTextEmployee
              ]}>
                {role?.toUpperCase()}
              </ThemedText>
            </View>

            {/* Plan badge */}
            <View style={styles.planBadge}>
              <ThemedText style={styles.planBadgeText}>{planLabel}</ThemedText>
            </View>
          </View>
        </View>

        {/* ── PLAN CARD ── */}
        <TouchableOpacity
          style={styles.planCard}
          onPress={() => router.push("/plans")}
          activeOpacity={0.8}
        >
          <View style={styles.planCardIcon}>
            <Ionicons name="flash" size={18} color="#22C55E" />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.planCardTitle}>{planCardTitle}</ThemedText>
            <ThemedText style={styles.planCardSub}>{planCardSub}</ThemedText>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#22C55E" />
        </TouchableOpacity>

        {/* ── ADMIN TOOLS ── */}
        {role === "admin" && (
          <>
            <SectionHeader label="ADMIN TOOLS" />

            {/* Invite Code Card */}
            <View style={styles.inviteCard}>
              <ThemedText style={styles.inviteCardLabel}>TEAM INVITE CODE</ThemedText>

              {inviteCode ? (
                <>
                  <ThemedText style={styles.inviteCodeText}>
                    {`${inviteCode.slice(0, 3)}-${inviteCode.slice(3)}`}
                  </ThemedText>
                  <ThemedText style={styles.inviteCardHint}>
                    This code expires as soon as you generate a new one.
                  </ThemedText>
                  <View style={styles.inviteBtnRow}>
                    <TouchableOpacity style={styles.shareBtn} onPress={shareCode} activeOpacity={0.8}>
                      <Ionicons name="share-outline" size={15} color="#38BDF8" style={{ marginRight: 6 }} />
                      <ThemedText style={styles.shareBtnText}>Share</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.regenBtn}
                      onPress={generateCode}
                      disabled={generatingCode}
                      activeOpacity={0.8}
                    >
                      {generatingCode
                        ? <ActivityIndicator size="small" color="#F97316" />
                        : <>
                            <Ionicons name="refresh-outline" size={15} color="#F97316" style={{ marginRight: 6 }} />
                            <ThemedText style={styles.regenBtnText}>New Code</ThemedText>
                          </>
                      }
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <ThemedText style={styles.inviteCardHint}>
                    Generate a fresh code to share with an employee. Each code invalidates the previous one.
                  </ThemedText>
                  <TouchableOpacity
                    style={styles.shareBtn}
                    onPress={generateCode}
                    disabled={generatingCode}
                    activeOpacity={0.8}
                  >
                    {generatingCode
                      ? <ActivityIndicator size="small" color="#38BDF8" />
                      : <>
                          <Ionicons name="key-outline" size={15} color="#38BDF8" style={{ marginRight: 6 }} />
                          <ThemedText style={styles.shareBtnText}>Generate Code</ThemedText>
                        </>
                    }
                  </TouchableOpacity>
                </>
              )}
            </View>

            <View style={styles.card}>
              <MenuRow
                icon="document-text-outline"
                label="Manage Policies"
                onPress={() => router.push("../admin/manage-policies")}
                isFirst
              />
              <MenuRow
                icon="people-outline"
                label="Manage Employees"
                onPress={() => router.push("../admin/manage-employees")}
              />
              <MenuRow
                icon="card-outline"
                label="Payment Method"
                sublabel={cardInfoLabel}
                onPress={() => router.push("/payment-setup")}
                isLast
              />
            </View>
          </>
        )}

        {/* ── EMPLOYEE PAYOUT ── */}
        {role === "employee" && (
          <>
            <SectionHeader label="PAYOUTS" />
            <View style={styles.card}>
              <MenuRow
                icon="wallet-outline"
                label="Payout Account"
                sublabel={payoutInfoLabel}
                onPress={() => router.push("/payout-setup")}
                isFirst
                isLast
              />
            </View>
          </>
        )}

        {/* ── ACCOUNT ── */}
        <SectionHeader label="ACCOUNT" />
        <View style={styles.card}>
          <MenuRow
            icon="chatbubble-ellipses-outline"
            label="AI Assistant"
            sublabel="Ask questions about claims & policy"
            onPress={() => router.push("/chatbot")}
            isFirst
          />
          <MenuRow
            icon="lock-closed-outline"
            label="Reset Password"
            onPress={resetPassword}
            isLast
          />
        </View>

        {/* ── DANGER ZONE ── */}
        <SectionHeader label="DANGER ZONE" />
        <View style={styles.card}>
          <MenuRow
            icon="trash-outline"
            label="Delete Account"
            onPress={openDeleteModal}
            danger
            isFirst
          />
          <MenuRow
            icon="log-out-outline"
            label={loggingOut ? "Logging out…" : "Log Out"}
            onPress={loggingOut ? undefined : logout}
            danger
            chevron={!loggingOut}
            rightElement={loggingOut
              ? <ActivityIndicator color="#F87171" size="small" />
              : undefined
            }
            isLast
          />
        </View>

      </ScrollView>

      {/* ── DELETE CONFIRMATION MODAL ── */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => !deleting && setShowDeleteModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => !deleting && setShowDeleteModal(false)}
          />

          <View style={styles.modalBox}>

            <View style={styles.modalIconRow}>
              <View style={styles.modalIconWrap}>
                <Ionicons name="warning-outline" size={22} color="#F87171" />
              </View>
            </View>

            <ThemedText style={styles.modalTitle}>Delete Account</ThemedText>

            <ThemedText style={styles.modalBody}>
              This will permanently delete your account, all your claims, and — if you are the admin — your entire organisation. This cannot be undone.
            </ThemedText>

            <ThemedText style={styles.modalLabel}>
              Enter your password to confirm:
            </ThemedText>

            <TextInput
              value={deletePassword}
              onChangeText={text => { setDeletePassword(text); setDeleteError(""); }}
              placeholder="Password"
              placeholderTextColor="#475569"
              secureTextEntry
              autoFocus={Platform.OS === "ios"}
              style={styles.passwordInput}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {!!deleteError && (
              <ThemedText style={styles.errorText}>{deleteError}</ThemedText>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                <ThemedText style={styles.cancelText}>Cancel</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmDeleteBtn, deleting && styles.btnDisabled]}
                onPress={confirmDelete}
                disabled={deleting}
              >
                {deleting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <ThemedText style={styles.deleteText}>Delete</ThemedText>
                }
              </TouchableOpacity>
            </View>

          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

//////////////////////////////////////////////////////
// STYLES
//////////////////////////////////////////////////////

const styles = StyleSheet.create({

  root: {
    flex: 1,
    backgroundColor: "#0F172A"
  },

  container: {
    paddingHorizontal: 20,
    paddingTop: 12
  },

  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0F172A"
  },

  /* ── Avatar ── */
  avatarSection: {
    alignItems: "center",
    paddingVertical: 28,
    marginBottom: 8
  },

  avatarRing: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 3,
    borderColor: "#38BDF8",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14
  },

  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#1E3A5F",
    justifyContent: "center",
    alignItems: "center"
  },

  avatarText: {
    color: "#38BDF8",
    fontSize: 38,
    fontWeight: "800"
  },

  name: {
    color: "#F8FAFC",
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 0.3
  },

  email: {
    color: "#64748B",
    marginTop: 4,
    fontSize: 14
  },

  badgeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12
  },

  roleBadge: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4
  },

  roleBadgeAdmin: {
    backgroundColor: "#1C1917",
    borderWidth: 1,
    borderColor: "#F59E0B"
  },

  roleBadgeEmployee: {
    backgroundColor: "#0C1A2E",
    borderWidth: 1,
    borderColor: "#38BDF8"
  },

  roleBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1
  },

  roleBadgeTextAdmin:    { color: "#F59E0B" },
  roleBadgeTextEmployee: { color: "#38BDF8" },

  planBadge: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155"
  },

  planBadgeText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8
  },

  /* ── Plan card ── */
  planCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#052E16",
    borderWidth: 1.5,
    borderColor: "#166534",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    gap: 12
  },

  planCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#0A3D1A",
    justifyContent: "center",
    alignItems: "center"
  },

  planCardTitle: {
    color: "#4ADE80",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2
  },

  planCardSub: {
    color: "#4B7A59",
    fontSize: 12
  },

  /* ── Section header ── */
  sectionHeader: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 8,
    marginLeft: 4
  },

  /* ── Menu card ── */
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    marginBottom: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#334155"
  },

  /* ── Invite code card ── */
  inviteCard: {
    backgroundColor: "#0D2137",
    borderWidth: 1,
    borderColor: "#2563EB33",
    borderRadius: 14,
    padding: 16,
    marginBottom: 14
  },

  inviteCardLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10
  },

  inviteCodeText: {
    color: "#38BDF8",
    fontSize: 28,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    letterSpacing: 4,
    marginBottom: 8
  },

  inviteCardHint: {
    color: "#475569",
    fontSize: 12,
    marginBottom: 14
  },

  inviteBtnRow: {
    flexDirection: "row",
    gap: 10,
  },

  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F2A3D",
    borderWidth: 1,
    borderColor: "#2563EB55",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  shareBtnText: {
    color: "#38BDF8",
    fontSize: 13,
    fontWeight: "600",
  },

  regenBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1208",
    borderWidth: 1,
    borderColor: "#F9741644",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  regenBtnText: {
    color: "#F97316",
    fontSize: 13,
    fontWeight: "600",
  },

  /* ── Menu row ── */
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14
  },

  menuRowFirst: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16
  },

  menuRowLast: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16
  },

  menuRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#334155"
  },

  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#0F2A3D",
    justifyContent: "center",
    alignItems: "center"
  },

  iconWrapDanger: {
    backgroundColor: "#2D0A0A"
  },

  menuLabelBlock: {
    flex: 1,
    gap: 2
  },

  menuLabel: {
    color: "#F1F5F9",
    fontSize: 15,
    fontWeight: "500"
  },

  menuLabelDanger: {
    color: "#F87171"
  },

  menuSublabel: {
    color: "#64748B",
    fontSize: 12
  },

  /* ── Modal ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20
  },

  modalBox: {
    width: "100%",
    backgroundColor: "#1E293B",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#334155"
  },

  modalIconRow: {
    alignItems: "center",
    marginBottom: 14
  },

  modalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#2D0A0A",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#7F1D1D"
  },

  modalTitle: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center"
  },

  modalBody: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
    textAlign: "center"
  },

  modalLabel: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8
  },

  passwordInput: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    color: "#F8FAFC",
    fontSize: 15,
    marginBottom: 8
  },

  errorText: {
    color: "#F87171",
    fontSize: 13,
    marginBottom: 12
  },

  modalButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8
  },

  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: "#334155",
    alignItems: "center"
  },

  cancelText: {
    color: "#CBD5E1",
    fontWeight: "600",
    fontSize: 15
  },

  confirmDeleteBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: "#DC2626",
    alignItems: "center"
  },

  deleteText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 15
  },

  btnDisabled: {
    opacity: 0.6
  }

});
