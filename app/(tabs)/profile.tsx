import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
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
import * as StoreReview from "expo-store-review";

import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { auth, db } from "../../app/firebase/firebaseConfig";
import { ThemedText } from "../../components/themed-text";
import { useAuth } from "../context/AuthProvider";
import { unsubscribeAll } from "../../utils/listenerStore";
import { useTheme } from "../../hooks/useTheme";

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
  const { tokens: t } = useTheme();
  const style = useMemo(() => StyleSheet.create({
    sectionHeader: {
      color: t.textTertiary,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.4,
      textTransform: "uppercase",
      marginBottom: 8,
      marginTop: 4,
      marginLeft: 4,
    }
  }), [t]);
  return (
    <ThemedText style={style.sectionHeader}>{label}</ThemedText>
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
  const { tokens: t } = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 15,
      gap: 14,
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
      borderBottomColor: t.border
    },
    iconWrap: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: t.surface,
      justifyContent: "center",
      alignItems: "center"
    },
    iconWrapDanger: {
      backgroundColor: t.errorSurface,
    },
    menuLabelBlock: {
      flex: 1,
      gap: 2
    },
    menuLabel: {
      color: t.text,
      fontSize: 15,
      fontWeight: "500"
    },
    menuLabelDanger: {
      color: t.error
    },
    menuSublabel: {
      color: t.textSecondary,
      fontSize: 12
    },
  }), [t]);

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
          color={danger ? t.error : t.accent}
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
          <Ionicons name="chevron-forward" size={16} color={t.textTertiary} />
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
  const { role, orgPlan, trialDaysLeft, orgId, refreshMembership } = useAuth();
  const { tokens: t, mode, toggleTheme } = useTheme();
  const [refreshingRole, setRefreshingRole] = useState(false);
  const spinAnim = useRef(new Animated.Value(0)).current;

  const [username, setUsername] = useState("");
  const [orgName, setOrgName] = useState<string | null>(null);
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

        // Load organisation name
        if (orgId) {
          const orgSnap = await getDoc(doc(db, "organisations", orgId));
          if (orgSnap.exists()) {
            setOrgName(orgSnap.data().name ?? null);
          }
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

  // Hard refresh role
  const hardRefresh = async () => {
    setRefreshingRole(true);
    Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 700, useNativeDriver: true })
    ).start();
    try {
      await refreshMembership();
    } finally {
      setRefreshingRole(false);
      spinAnim.stopAnimation();
      spinAnim.setValue(0);
    }
  };

  //////////////////////////////////////////////////////
  // RATE THE APP
  //////////////////////////////////////////////////////

  const handleRateApp = async () => {
    const available = await StoreReview.isAvailableAsync();
    if (available) {
      await StoreReview.requestReview();
    } else {
      // Fallback: open the store listing directly
      const storeUrl = Platform.OS === "ios"
        ? "https://apps.apple.com/app/id6746710023"
        : "https://play.google.com/store/apps/details?id=com.saif1004.claimio";
      Linking.openURL(storeUrl);
    }
  };

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
  // STYLES
  //////////////////////////////////////////////////////

  const styles = useMemo(() => StyleSheet.create({

    root: {
      flex: 1,
      backgroundColor: t.bg
    },

    container: {
      paddingHorizontal: 20,
      paddingTop: 0,      // insets.top already on root; avatar section supplies its own top space
    },

    loading: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: t.bg
    },

    /* ── Avatar ── */
    avatarSection: {
      alignItems: "center",
      paddingTop: 32,      // generous headroom below status bar
      paddingBottom: 24,
      marginBottom: 8,
    },

    avatarRing: {
      width: 112,
      height: 112,
      borderRadius: 56,
      backgroundColor: t.accentSurface,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
    },

    avatar: {
      width: 112,
      height: 112,
      borderRadius: 56,
      backgroundColor: t.accentSurface,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 20,
    },

    avatarText: {
      color: t.accent,
      fontSize: 34,              // reduced — letter no longer crowds the circle edges
      fontWeight: "700",
      lineHeight: 44,            // explicit lineHeight stops Android clipping the glyph top
      includeFontPadding: false, // Android: strip internal font box padding
    },

    name: {
      color: t.text,
      fontSize: 24,
      fontWeight: "800",
      letterSpacing: -0.3,
      lineHeight: 32,
      includeFontPadding: false,
    },

    email: {
      color: t.textSecondary,
      marginTop: 4,
      fontSize: 14,
      includeFontPadding: false,
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
      backgroundColor: t.warningSurface,
      borderWidth: 1,
      borderColor: t.warning
    },

    roleBadgeEmployee: {
      backgroundColor: t.accentSurface,
      borderWidth: 1,
      borderColor: t.accent
    },

    roleBadgeText: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1
    },

    roleBadgeTextAdmin:    { color: t.warning },
    roleBadgeTextEmployee: { color: t.accent },

    planBadge: {
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 4,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border
    },

    planBadgeText: {
      color: t.textSecondary,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.8
    },

    orgRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 6,
    },

    orgName: {
      color: t.textSecondary,
      fontSize: 13,
      fontWeight: "500",
    },

    refreshBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      justifyContent: "center",
      alignItems: "center"
    },

    /* ── Plan card ── */
    planCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.surface,
      borderRadius: t.radius.lg,
      padding: 18,
      marginBottom: 24,
      gap: 14,
    },

    planCardIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: t.successSurface,
      justifyContent: "center",
      alignItems: "center"
    },

    planCardTitle: {
      color: t.success,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 2
    },

    planCardSub: {
      color: t.textSecondary,
      fontSize: 12
    },

    /* ── Menu card ── */
    card: {
      backgroundColor: t.surface,
      borderRadius: t.radius.lg,
      marginBottom: 24,
      overflow: "hidden",
    },

    /* ── Invite code card ── */
    inviteCard: {
      backgroundColor: t.accentSurface,
      borderWidth: 1,
      borderColor: t.accent + "33",
      borderRadius: 14,
      padding: 16,
      marginBottom: 14
    },

    inviteCardLabel: {
      color: t.textSecondary,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase",
      marginBottom: 10
    },

    inviteCodeText: {
      color: t.accent,
      fontSize: 28,
      fontWeight: "800",
      fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
      letterSpacing: 4,
      marginBottom: 8
    },

    inviteCardHint: {
      color: t.textTertiary,
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
      backgroundColor: t.accentSurface,
      borderWidth: 1,
      borderColor: t.accent + "55",
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    shareBtnText: {
      color: t.accent,
      fontSize: 13,
      fontWeight: "600",
    },

    regenBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.warningSurface,
      borderWidth: 1,
      borderColor: t.warning + "44",
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    regenBtnText: {
      color: t.warning,
      fontSize: 13,
      fontWeight: "600",
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
      backgroundColor: t.surface,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: t.border
    },

    modalIconRow: {
      alignItems: "center",
      marginBottom: 14
    },

    modalIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: t.errorSurface,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: t.error
    },

    modalTitle: {
      color: t.text,
      fontSize: 20,
      fontWeight: "700",
      marginBottom: 10,
      textAlign: "center"
    },

    modalBody: {
      color: t.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      marginBottom: 18,
      textAlign: "center"
    },

    modalLabel: {
      color: t.text,
      fontSize: 13,
      fontWeight: "600",
      marginBottom: 8
    },

    passwordInput: {
      backgroundColor: t.surfaceAlt,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === "ios" ? 14 : 10,
      color: t.text,
      fontSize: 15,
      marginBottom: 8
    },

    errorText: {
      color: t.error,
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
      backgroundColor: t.border,
      alignItems: "center"
    },

    cancelText: {
      color: t.text,
      fontWeight: "600",
      fontSize: 15
    },

    confirmDeleteBtn: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: 10,
      backgroundColor: t.error,
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

  }), [t]);

  //////////////////////////////////////////////////////
  // LOADING STATE
  //////////////////////////////////////////////////////

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={t.accent} />
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
    <SafeAreaView style={styles.root} edges={["top"]}>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── AVATAR SECTION ── */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <ThemedText style={styles.avatarText}>{initials}</ThemedText>
          </View>

          <ThemedText style={styles.name}>{username || "User"}</ThemedText>
          <ThemedText style={styles.email}>{user?.email}</ThemedText>

          {!!orgName && (
            <View style={styles.orgRow}>
              <Ionicons name="business-outline" size={13} color={t.textSecondary} />
              <ThemedText style={styles.orgName}>{orgName}</ThemedText>
            </View>
          )}

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

            {/* Hard refresh button */}
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={hardRefresh}
              disabled={refreshingRole}
              activeOpacity={0.75}
            >
              <Animated.View style={{
                transform: [{
                  rotate: spinAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] })
                }]
              }}>
                <Ionicons name="refresh-outline" size={14} color={refreshingRole ? t.accent : t.textSecondary} />
              </Animated.View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── PLAN CARD ── */}
        <TouchableOpacity
          style={styles.planCard}
          onPress={() => router.push(
            orgPlan === "pro" || orgPlan === "business"
              ? "/manage-subscription"
              : "/plans"
          )}
          activeOpacity={0.8}
        >
          <View style={styles.planCardIcon}>
            <Ionicons name="flash" size={18} color={t.success} />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.planCardTitle}>{planCardTitle}</ThemedText>
            <ThemedText style={styles.planCardSub}>{planCardSub}</ThemedText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={t.success} />
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
                      <Ionicons name="share-outline" size={15} color={t.accent} style={{ marginRight: 6 }} />
                      <ThemedText style={styles.shareBtnText}>Share</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.regenBtn}
                      onPress={generateCode}
                      disabled={generatingCode}
                      activeOpacity={0.8}
                    >
                      {generatingCode
                        ? <ActivityIndicator size="small" color={t.warning} />
                        : <>
                            <Ionicons name="refresh-outline" size={15} color={t.warning} style={{ marginRight: 6 }} />
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
                      ? <ActivityIndicator size="small" color={t.accent} />
                      : <>
                          <Ionicons name="key-outline" size={15} color={t.accent} style={{ marginRight: 6 }} />
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
                icon="pricetag-outline"
                label="Manage Categories"
                onPress={() => router.push("../admin/manage-categories")}
              />
              <MenuRow
                icon="card-outline"
                label="Payment Method"
                sublabel={cardInfoLabel}
                onPress={() => router.push("/payment-setup")}
              />
              <MenuRow
                icon="wallet-outline"
                label="Payout Account"
                sublabel={payoutInfoLabel ?? "Set up to receive reimbursements"}
                onPress={() => router.push("/payout-setup")}
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
            icon={mode === 'dark' ? "moon-outline" : "sunny-outline"}
            label="Appearance"
            sublabel={mode === 'dark' ? "Dark mode" : "Light mode"}
            onPress={toggleTheme}
            isFirst
            rightElement={
              <Switch
                value={mode === 'dark'}
                onValueChange={toggleTheme}
                trackColor={{ false: t.border, true: t.accent }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={t.border}
              />
            }
          />
          <MenuRow
            icon="card-outline"
            label="Manage Subscription"
            sublabel={`Current plan: ${planLabel}`}
            onPress={() => router.push("/manage-subscription")}
          />
          <MenuRow
            icon="chatbubble-ellipses-outline"
            label="AI Assistant"
            sublabel="Ask questions about claims & policy"
            onPress={() => router.push("/chatbot")}
          />
          <MenuRow
            icon="star-outline"
            label="Rate Claimio"
            sublabel="Enjoying the app? Leave us a review!"
            onPress={handleRateApp}
          />
          <MenuRow
            icon="help-circle-outline"
            label="Help & Feedback"
            sublabel="Report a bug or share a suggestion"
            onPress={() => router.push("/help-feedback")}
          />
          <MenuRow
            icon="lock-closed-outline"
            label="Reset Password"
            onPress={resetPassword}
            isLast
          />
        </View>

        {/* ── LEGAL ── */}
        <SectionHeader label="LEGAL" />
        <View style={styles.card}>
          <MenuRow
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            onPress={() => router.push("/privacy-policy")}
            isFirst
          />
          <MenuRow
            icon="document-text-outline"
            label="Terms & Conditions"
            onPress={() => router.push("/terms")}
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
              ? <ActivityIndicator color={t.error} size="small" />
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
                <Ionicons name="warning-outline" size={22} color={t.error} />
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
              placeholderTextColor={t.textTertiary}
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

    </SafeAreaView>
  );
}
