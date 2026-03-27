import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
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

import { doc, getDoc } from "firebase/firestore";

import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { auth, db } from "../../app/firebase/firebaseConfig";
import { ThemedText } from "../../components/themed-text";
import { useAuth } from "../context/AuthProvider";
import { unsubscribeAll } from "../../utils/listenerStore";

const DELETE_URL = process.env.EXPO_PUBLIC_DELETE_ACCOUNT_URL!;

export default function ProfileScreen() {

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { role, orgPlan, trialDaysLeft } = useAuth();

  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

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
        if (snap.exists()) setUsername(snap.data().username);
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
      // Re-authenticate to confirm identity
      const credential = EmailAuthProvider.credential(user.email, deletePassword);
      await reauthenticateWithCredential(user, credential);

      // Get a fresh token for the server
      const token = await user.getIdToken(true);

      // Server deletes all Firestore data + Firebase Auth user
      const res = await fetch(DELETE_URL, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Server error");
      }

      // Detach all listeners before sign-out to prevent permission-denied errors
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
  // LOADING STATE
  //////////////////////////////////////////////////////

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  //////////////////////////////////////////////////////
  // UI
  //////////////////////////////////////////////////////

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        <ThemedText type="title" style={styles.title}>Profile</ThemedText>

        {/* AVATAR */}
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <ThemedText style={styles.avatarText}>
              {username?.charAt(0)?.toUpperCase() || "U"}
            </ThemedText>
          </View>
          <ThemedText style={styles.name}>{username || "User"}</ThemedText>
          <ThemedText style={styles.email}>{user?.email}</ThemedText>
          <View style={styles.planBadge}>
            <ThemedText style={styles.planBadgeText}>
              {orgPlan === "trial"
                ? `Trial · ${trialDaysLeft}d left`
                : orgPlan.charAt(0).toUpperCase() + orgPlan.slice(1)}
            </ThemedText>
          </View>
        </View>

        {/* PLAN CARD */}
        <TouchableOpacity
          style={styles.planCard}
          onPress={() => router.push("/plans")}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.planCardTitle}>
              {orgPlan === "free"
                ? "Start your free trial"
                : orgPlan === "trial"
                ? "Upgrade to keep access"
                : "Manage subscription"}
            </ThemedText>
            <ThemedText style={styles.planCardSub}>
              {orgPlan === "free"
                ? "7 days of Pro features, no payment needed"
                : orgPlan === "trial"
                ? `${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} remaining on trial`
                : `You're on the ${orgPlan.charAt(0).toUpperCase() + orgPlan.slice(1)} plan`}
            </ThemedText>
          </View>
          <ThemedText style={styles.planCardArrow}>›</ThemedText>
        </TouchableOpacity>

        {/* ADMIN TOOLS */}
        {role === "admin" && (
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push("../admin/manage-policies")}
            >
              <ThemedText style={styles.actionText}>Manage Policies</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push("../admin/manage-employees")}
            >
              <ThemedText style={styles.actionText}>Manage Employees</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push("/payment-setup")}
            >
              <ThemedText style={styles.actionText}>💳  Payment Method</ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* EMPLOYEE PAYOUT */}
        {role === "employee" && (
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push("/payout-setup")}
            >
              <ThemedText style={styles.actionText}>🏦  Payout Account</ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* ACCOUNT */}
        <View style={styles.card}>
          <TouchableOpacity style={styles.actionButton} onPress={resetPassword}>
            <ThemedText style={styles.actionText}>Reset Password</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteButton} onPress={openDeleteModal}>
            <ThemedText style={styles.deleteText}>Delete Account</ThemedText>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={logout}
          disabled={loggingOut}
        >
          {loggingOut
            ? <ActivityIndicator color="#fff" />
            : <ThemedText style={styles.logoutText}>Log Out</ThemedText>
          }
        </TouchableOpacity>

      </ScrollView>

      {/* DELETE CONFIRMATION MODAL */}
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
    paddingTop: 16
  },

  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0F172A"
  },

  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#F8FAFC",
    marginBottom: 10
  },

  avatarContainer: {
    alignItems: "center",
    marginBottom: 28
  },

  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10
  },

  avatarText: {
    color: "#FFF",
    fontSize: 30,
    fontWeight: "bold"
  },

  name: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "600"
  },

  email: {
    color: "#94A3B8",
    marginTop: 4,
    fontSize: 14
  },

  planBadge: {
    marginTop: 10,
    backgroundColor: "#1E293B",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#334155"
  },

  planBadgeText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8
  },

  planCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F2A1A",
    borderWidth: 1.5,
    borderColor: "#22C55E",
    borderRadius: 14,
    padding: 16,
    marginBottom: 20
  },

  planCardTitle: {
    color: "#22C55E",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 3
  },

  planCardSub: {
    color: "#64748B",
    fontSize: 12
  },

  planCardArrow: {
    color: "#22C55E",
    fontSize: 24,
    marginLeft: 8
  },

  card: {
    backgroundColor: "rgba(30,41,59,0.95)",
    padding: 16,
    borderRadius: 14,
    marginBottom: 20
  },

  actionButton: {
    paddingVertical: 10
  },

  actionText: {
    color: "#38BDF8",
    fontSize: 16
  },

  deleteButton: {
    marginTop: 14,
    backgroundColor: "#DC2626",
    padding: 13,
    borderRadius: 10,
    alignItems: "center"
  },

  deleteText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 15
  },

  logoutButton: {
    backgroundColor: "#EF4444",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center"
  },

  logoutText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600"
  },

  // MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20
  },

  modalBox: {
    width: "100%",
    backgroundColor: "#1E293B",
    borderRadius: 18,
    padding: 24,
    borderWidth: 1,
    borderColor: "#334155"
  },

  modalTitle: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12
  },

  modalBody: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16
  },

  modalLabel: {
    color: "#CBD5E1",
    fontSize: 14,
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

  btnDisabled: {
    opacity: 0.6
  }

});
