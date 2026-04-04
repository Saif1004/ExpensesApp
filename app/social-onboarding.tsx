/**
 * social-onboarding.tsx
 *
 * Shown after a new user signs in with Google or Apple for the first time.
 * The user is already authenticated in Firebase — they just need to choose a
 * username and either create an organisation (admin) or join one (employee).
 * No email/password fields needed here.
 */

import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "./firebase/firebaseConfig";
import { useAuth } from "./context/AuthProvider";
import { useTheme } from "../hooks/useTheme";

//////////////////////////////////////////////////////
// HELPERS
//////////////////////////////////////////////////////

const generateInviteCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

const usernameExists = async (username: string) => {
  const snap = await getDoc(doc(db, "usernames", username));
  return snap.exists();
};

const orgNameExists = async (nameLower: string) => {
  const snap = await getDocs(
    query(collection(db, "organisations"), where("nameLower", "==", nameLower))
  );
  return !snap.empty;
};

//////////////////////////////////////////////////////
// TYPES
//////////////////////////////////////////////////////

type Mode = "choose" | "create" | "join";

//////////////////////////////////////////////////////
// SCREEN
//////////////////////////////////////////////////////

export default function SocialOnboarding() {
  const router = useRouter();
  const { user, refreshMembership } = useAuth();
  const { tokens: t } = useTheme();

  const [mode, setMode]             = useState<Mode>("choose");
  const [username, setUsername]     = useState("");
  const [organisation, setOrg]      = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading]       = useState(false);

  // Guard: if no user is authenticated, redirect to sign-in
  if (!user) {
    router.replace("/sign-in");
    return null;
  }

  const goTo = (m: Mode) => {
    setUsername("");
    setOrg("");
    setInviteCode("");
    setMode(m);
  };

  //////////////////////////////////////////////////////
  // CREATE ORGANISATION
  //////////////////////////////////////////////////////

  const handleCreate = async () => {
    const trimmedUsername    = username.trim();
    const normalizedUsername = trimmedUsername.toLowerCase();
    const trimmedOrg         = organisation.trim();
    const normalizedOrg      = trimmedOrg.toLowerCase();

    if (!trimmedOrg || !trimmedUsername) {
      Alert.alert("Missing details", "Please fill in your username and organisation name.");
      return;
    }

    if (trimmedUsername.length < 3) {
      Alert.alert("Username too short", "Username must be at least 3 characters.");
      return;
    }

    if (await usernameExists(normalizedUsername)) {
      Alert.alert("Username taken", "Please choose a different username.");
      return;
    }

    if (await orgNameExists(normalizedOrg)) {
      Alert.alert("Organisation name taken", "Please choose a different name.");
      return;
    }

    setLoading(true);
    try {
      const uid    = user.uid;
      const email  = user.email ?? "";
      const orgRef = doc(collection(db, "organisations"));
      const membershipRef   = doc(collection(db, "memberships"));
      const userRef         = doc(db, "users", uid);
      const usernameRef     = doc(db, "usernames", normalizedUsername);
      const inviteCodeValue = generateInviteCode();

      const batch = writeBatch(db);
      batch.set(userRef, {
        uid,
        email,
        username:    normalizedUsername,
        displayName: trimmedUsername,
        createdAt:   serverTimestamp(),
        plan:        "free",
      }, { merge: true });
      batch.set(usernameRef, { uid, email });
      batch.set(orgRef, {
        name:               trimmedOrg,
        nameLower:          normalizedOrg,
        ownerId:            uid,
        plan:               "free",
        inviteCode:         inviteCodeValue,
        aiCreditsRemaining: 0,
        aiCreditsResetAt:   null,
        createdAt:          serverTimestamp(),
      });
      batch.set(membershipRef, {
        userId:      uid,
        orgId:       orgRef.id,
        role:        "admin",
        status:      "approved",
        displayName: trimmedUsername,
        email,
        createdAt:   serverTimestamp(),
      });
      await batch.commit();

      await refreshMembership();
      router.replace("/(tabs)/home");

    } catch {
      Alert.alert("Setup failed", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  //////////////////////////////////////////////////////
  // JOIN ORGANISATION
  //////////////////////////////////////////////////////

  const handleJoin = async () => {
    const trimmedUsername    = username.trim();
    const normalizedUsername = trimmedUsername.toLowerCase();
    const trimmedCode        = inviteCode.trim().toUpperCase();

    if (!trimmedCode || !trimmedUsername) {
      Alert.alert("Missing details", "Please enter your username and invite code.");
      return;
    }

    if (trimmedUsername.length < 3) {
      Alert.alert("Username too short", "Username must be at least 3 characters.");
      return;
    }

    if (await usernameExists(normalizedUsername)) {
      Alert.alert("Username taken", "Please choose a different username.");
      return;
    }

    setLoading(true);
    try {
      const uid   = user.uid;
      const email = user.email ?? "";

      const orgQuery = query(
        collection(db, "organisations"),
        where("inviteCode", "==", trimmedCode)
      );
      const orgSnap = await getDocs(orgQuery);

      if (orgSnap.empty) {
        Alert.alert("Invalid invite code", "Ask your admin for the correct code.");
        return;
      }

      const orgId = orgSnap.docs[0].id;

      const batch         = writeBatch(db);
      const userRef       = doc(db, "users", uid);
      const usernameRef   = doc(db, "usernames", normalizedUsername);
      const membershipRef = doc(collection(db, "memberships"));

      batch.set(userRef, {
        uid,
        email,
        username:    normalizedUsername,
        displayName: trimmedUsername,
        createdAt:   serverTimestamp(),
        plan:        "free",
      }, { merge: true });
      batch.set(usernameRef, { uid, email });
      batch.set(membershipRef, {
        userId:      uid,
        orgId,
        role:        "employee",
        status:      "pending",
        displayName: trimmedUsername,
        email,
        createdAt:   serverTimestamp(),
      });

      await batch.commit();

      // Sign out — must wait for admin approval
      await signOut(auth);
      Alert.alert(
        "Request sent",
        "Your request has been sent to the admin for approval. You'll be able to sign in once approved.",
        [{ text: "OK", onPress: () => router.replace("/sign-in") }]
      );

    } catch {
      Alert.alert("Setup failed", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  //////////////////////////////////////////////////////
  // STYLES
  //////////////////////////////////////////////////////

  const styles = useMemo(() => StyleSheet.create({
    flex: { flex: 1 },

    container: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingVertical: 60,
    },

    formContainer: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 40,
    },

    logoWrap: {
      alignItems: "center",
      marginBottom: 40,
    },
    logoIcon: {
      width: 72,
      height: 72,
      borderRadius: 22,
      backgroundColor: t.accentSurface,
      borderWidth: 1.5,
      borderColor: t.accent + "33",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 14,
    },
    logoTitle: {
      color: t.text,
      fontSize: 28,
      fontWeight: "800",
      marginBottom: 6,
    },
    logoSub: {
      color: t.textSecondary,
      fontSize: 15,
      textAlign: "center",
      paddingHorizontal: 20,
    },

    chooseCard: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 18,
      padding: 18,
      marginBottom: 14,
      borderWidth: 1.5,
      gap: 14,
      backgroundColor: t.accentSurface,
      borderColor: t.accent,
    },
    chooseCardIcon: {
      width: 52,
      height: 52,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: t.accentSurface,
    },
    chooseCardText: { flex: 1 },
    chooseCardTitle: {
      color: t.text,
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 3,
    },
    chooseCardSub: {
      color: t.textSecondary,
      fontSize: 13,
    },

    backBtn: {
      width: 40,
      height: 40,
      justifyContent: "center",
      marginBottom: 24,
    },
    formHeader: { marginBottom: 32 },
    formTitle: {
      color: t.text,
      fontSize: 28,
      fontWeight: "800",
      marginBottom: 6,
    },
    formSubtitle: {
      color: t.textSecondary,
      fontSize: 15,
    },

    fieldGroup: { marginBottom: 16 },
    fieldLabel: {
      color: t.textSecondary,
      fontSize: 12,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 8,
    },
    input: {
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: Platform.OS === "ios" ? 15 : 11,
      color: t.text,
      fontSize: 15,
    },
    inviteInput: {
      fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
      fontSize: 22,
      fontWeight: "700",
      letterSpacing: 4,
      color: t.accent,
      textAlign: "center",
    },

    primaryBtn: {
      backgroundColor: t.accent,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 8,
    },
    primaryBtnText: {
      color: t.accentText,
      fontSize: 16,
      fontWeight: "700",
    },
    btnDisabled: { opacity: 0.6 },

    cancelLink: {
      marginTop: 20,
      alignItems: "center",
    },
    cancelText: {
      color: t.textTertiary,
      fontSize: 14,
    },
  }), [t]);

  //////////////////////////////////////////////////////
  // CHOOSE SCREEN
  //////////////////////////////////////////////////////

  if (mode === "choose") {
    return (
      <LinearGradient colors={[t.bg, t.surface]} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoWrap}>
            <View style={styles.logoIcon}>
              <Ionicons name="receipt-outline" size={32} color={t.accent} />
            </View>
            <Text style={styles.logoTitle}>One last step</Text>
            <Text style={styles.logoSub}>Set up your organisation to start using Claimio</Text>
          </View>

          <TouchableOpacity
            style={styles.chooseCard}
            onPress={() => goTo("create")}
            activeOpacity={0.8}
          >
            <View style={styles.chooseCardIcon}>
              <Ionicons name="briefcase-outline" size={26} color={t.accent} />
            </View>
            <View style={styles.chooseCardText}>
              <Text style={styles.chooseCardTitle}>Create Organisation</Text>
              <Text style={styles.chooseCardSub}>I'm setting up my company</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.accent} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.chooseCard}
            onPress={() => goTo("join")}
            activeOpacity={0.8}
          >
            <View style={styles.chooseCardIcon}>
              <Ionicons name="person-add-outline" size={26} color={t.accent} />
            </View>
            <View style={styles.chooseCardText}>
              <Text style={styles.chooseCardTitle}>Join Organisation</Text>
              <Text style={styles.chooseCardSub}>I have an invite code</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.accent} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelLink}
            onPress={async () => { await signOut(auth); router.replace("/sign-in"); }}
          >
            <Text style={styles.cancelText}>Cancel and sign out</Text>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    );
  }

  //////////////////////////////////////////////////////
  // CREATE SCREEN
  //////////////////////////////////////////////////////

  if (mode === "create") {
    return (
      <LinearGradient colors={[t.bg, t.surface]} style={styles.flex}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            contentContainerStyle={styles.formContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity onPress={() => goTo("choose")} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={t.textSecondary} />
            </TouchableOpacity>

            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Create Organisation</Text>
              <Text style={styles.formSubtitle}>You'll be the admin</Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Username</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="e.g. johndoe"
                placeholderTextColor={t.textTertiary}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Organisation Name</Text>
              <TextInput
                value={organisation}
                onChangeText={setOrg}
                placeholder="e.g. Acme Corp"
                placeholderTextColor={t.textTertiary}
                style={styles.input}
                autoCapitalize="words"
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.btnDisabled]}
              onPress={handleCreate}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color={t.accentText} />
                : <Text style={styles.primaryBtnText}>Create Account</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    );
  }

  //////////////////////////////////////////////////////
  // JOIN SCREEN
  //////////////////////////////////////////////////////

  return (
    <LinearGradient colors={[t.bg, t.surface]} style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.formContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity onPress={() => goTo("choose")} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={t.textSecondary} />
          </TouchableOpacity>

          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>Join Organisation</Text>
            <Text style={styles.formSubtitle}>Ask your admin for the invite code</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Username</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="e.g. janedoe"
              placeholderTextColor={t.textTertiary}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Invite Code</Text>
            <TextInput
              value={inviteCode}
              onChangeText={(v) => setInviteCode(v.toUpperCase())}
              placeholder="e.g. ABC4X7"
              placeholderTextColor={t.textTertiary}
              style={[styles.input, styles.inviteInput]}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={handleJoin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color={t.accentText} />
              : <Text style={styles.primaryBtnText}>Request to Join</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
