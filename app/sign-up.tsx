import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  updateProfile,
} from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { useMemo, useState } from "react";
import {
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
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "./context/AuthProvider";
import { auth, db } from "./firebase/firebaseConfig";
import { setIsSigningUp } from "./utils/signUpFlag";
import { useTheme } from "../hooks/useTheme";

//////////////////////////////////////////////////////
// Helpers
//////////////////////////////////////////////////////

const generateInviteCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const usernameExists = async (username: string) => {
  // Use getDoc on the exact document — where("__name__") matches the full path, not the ID
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
// Password strength validator
// Requirements: 8+ chars, 1 uppercase, 1 lowercase, 1 number
//////////////////////////////////////////////////////

function validatePassword(password: string): string | null {
  if (password.length < 8)            return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password))        return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(password))        return "Password must contain at least one lowercase letter.";
  if (!/[0-9]/.test(password))        return "Password must contain at least one number.";
  return null; // valid
}

//////////////////////////////////////////////////////
// Types
//////////////////////////////////////////////////////

type Mode = "choose" | "create" | "join";

//////////////////////////////////////////////////////
// Screen
//////////////////////////////////////////////////////

export default function SignUp() {
  const router = useRouter();
  const { refreshMembership } = useAuth();
  const { tokens: t } = useTheme();

  const [mode, setMode] = useState<Mode>("choose");

  // Shared fields
  const [username, setUsername]               = useState("");
  const [email, setEmail]                     = useState("");
  const [password, setPassword]               = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Create-only
  const [organisation, setOrganisation] = useState("");

  // Join-only
  const [inviteCode, setInviteCode] = useState("");

  const [loading, setLoading] = useState(false);

  //////////////////////////////////////////////////////
  // RESET fields when switching modes
  //////////////////////////////////////////////////////

  const goTo = (m: Mode) => {
    setUsername("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setOrganisation("");
    setInviteCode("");
    setMode(m);
  };

  //////////////////////////////////////////////////////
  // CREATE (admin flow)
  //////////////////////////////////////////////////////

  const handleCreate = async () => {
    const trimmedUsername  = username.trim();
    const normalizedUsername = trimmedUsername.toLowerCase();
    const trimmedEmail     = email.trim().toLowerCase();
    const trimmedOrg       = organisation.trim();
    const normalizedOrg    = trimmedOrg.toLowerCase();

    if (!trimmedOrg || !trimmedUsername || !trimmedEmail || !password || !confirmPassword) {
      Alert.alert("Missing details", "Please fill in all fields.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Passwords do not match", "Both password fields must be identical.");
      return;
    }

    const pwError = validatePassword(password);
    if (pwError) {
      Alert.alert("Weak password", pwError);
      return;
    }

    if (await usernameExists(normalizedUsername)) {
      Alert.alert("Username taken", "Please choose a different username.");
      return;
    }

    if (await orgNameExists(normalizedOrg)) {
      Alert.alert("Organisation name taken", "An organisation with that name already exists. Please choose a different name.");
      return;
    }

    setLoading(true);
    setIsSigningUp(true);
    let cred: any = null;
    try {
      cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      const uid  = cred.user.uid;

      await updateProfile(cred.user, { displayName: trimmedUsername });

      // ── Send verification email IMMEDIATELY after account creation ──
      try { await sendEmailVerification(cred.user); } catch {}

      const orgRef          = doc(collection(db, "organisations"));
      const membershipRef   = doc(collection(db, "memberships"));
      const userRef         = doc(db, "users", uid);
      const usernameRef     = doc(db, "usernames", normalizedUsername);
      const inviteCodeValue = generateInviteCode();

      const batch = writeBatch(db);
      batch.set(userRef, {
        uid,
        email:       trimmedEmail,
        username:    normalizedUsername,
        displayName: trimmedUsername,
        createdAt:   serverTimestamp(),
        plan:        "free",
      });
      batch.set(usernameRef, { uid, email: trimmedEmail });
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
        email:       trimmedEmail,
        createdAt:   serverTimestamp(),
      });
      await batch.commit();

      // ── Sign out — must verify email before accessing the app ──
      await signOut(auth);

      Alert.alert(
        "Check your email",
        "A verification link has been sent to your email address. Please verify before signing in.",
        [{ text: "Go to Sign In", onPress: () => router.replace("/sign-in") }]
      );

    } catch (err: any) {
      const code = err?.code ?? "";
      if (code === "auth/email-already-in-use") {
        Alert.alert("Email in use", "An account with this email already exists.");
      } else {
        // Clean up the auth account so the user can try again cleanly
        if (cred?.user) {
          try { await cred.user.delete(); } catch {}
        }
        Alert.alert("Sign up failed", "Something went wrong. Please try again.");
      }
    } finally {
      setIsSigningUp(false);
      setLoading(false);
    }
  };

  //////////////////////////////////////////////////////
  // JOIN (employee flow)
  //////////////////////////////////////////////////////

  const handleJoin = async () => {
    const trimmedCode        = inviteCode.trim().toUpperCase();
    const trimmedUsername    = username.trim();
    const normalizedUsername = trimmedUsername.toLowerCase();
    const trimmedEmail       = email.trim().toLowerCase();

    if (!trimmedCode || !trimmedUsername || !trimmedEmail || !password || !confirmPassword) {
      Alert.alert("Missing details", "Please fill in all fields.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Passwords do not match", "Both password fields must be identical.");
      return;
    }

    const pwError = validatePassword(password);
    if (pwError) {
      Alert.alert("Weak password", pwError);
      return;
    }

    if (await usernameExists(normalizedUsername)) {
      Alert.alert("Username taken", "Please choose a different username.");
      return;
    }

    setLoading(true);
    setIsSigningUp(true);
    let cred: any = null;

    try {
      // 1. Create auth user
      cred       = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      const uid        = cred.user.uid;

      await updateProfile(cred.user, { displayName: trimmedUsername });

      // ── Send verification email IMMEDIATELY after account creation ──
      try { await sendEmailVerification(cred.user); } catch {}

      // 2. Look up org by invite code
      // organisations are readable by any authenticated user (not just verified)
      // so this works immediately after createUserWithEmailAndPassword
      const orgQuery = query(
        collection(db, "organisations"),
        where("inviteCode", "==", trimmedCode)
      );
      const orgSnap = await getDocs(orgQuery);

      if (orgSnap.empty) {
        await cred.user.delete();
        Alert.alert("Invalid invite code", "Ask your admin for the correct code.");
        setLoading(false);
        return;
      }

      const orgId = orgSnap.docs[0].id;

      // 3. Write user doc, username doc, membership
      const batch       = writeBatch(db);
      const userRef     = doc(db, "users", uid);
      const usernameRef = doc(db, "usernames", normalizedUsername);
      const membershipRef = doc(collection(db, "memberships"));

      batch.set(userRef, {
        uid,
        email:       trimmedEmail,
        username:    normalizedUsername,
        displayName: trimmedUsername,
        createdAt:   serverTimestamp(),
        plan:        "free",
      });
      batch.set(usernameRef, { uid, email: trimmedEmail });
      batch.set(membershipRef, {
        userId:      uid,
        orgId,
        role:        "employee",
        status:      "pending",
        displayName: trimmedUsername,
        email:       trimmedEmail,
        createdAt:   serverTimestamp(),
      });

      await batch.commit();

      // 4. Sign out — must verify email AND wait for admin approval
      await signOut(auth);

      Alert.alert(
        "Check your email",
        "A verification link has been sent to your email. Please verify your address, then wait for your admin to approve your account.",
        [{ text: "Go to Sign In", onPress: () => router.replace("/sign-in") }]
      );

    } catch (err: any) {
      const code = err?.code ?? "";
      if (code === "auth/email-already-in-use") {
        Alert.alert("Email in use", "An account with this email already exists.");
      } else {
        // Clean up orphaned auth account so user can try again
        if (cred?.user) {
          try { await cred.user.delete(); } catch {}
        }
        Alert.alert("Sign up failed", "Something went wrong. Please try again.");
      }
    } finally {
      setIsSigningUp(false);
      setLoading(false);
    }
  };

  //////////////////////////////////////////////////////
  // STYLES
  //////////////////////////////////////////////////////

  const styles = useMemo(() => StyleSheet.create({

    flex: { flex: 1 },

    // ── Choose screen ──

    chooseContainer: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingVertical: 60,
    },

    logoWrap: {
      alignItems: "center",
      marginBottom: 48,
    },

    logoIcon: {
      width: 80,
      height: 80,
      borderRadius: 24,
      backgroundColor: t.accentSurface,
      borderWidth: 1.5,
      borderColor: t.accent + "33",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
    },

    appTitle: {
      color: t.text,
      fontSize: 34,
      fontWeight: "800",
      letterSpacing: 0.5,
      marginBottom: 6,
    },

    appSubtitle: {
      color: t.textSecondary,
      fontSize: 15,
      textAlign: "center",
    },

    chooseCard: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 18,
      padding: 18,
      marginBottom: 14,
      borderWidth: 1.5,
      gap: 14,
    },

    chooseCardBlue: {
      backgroundColor: t.accentSurface,
      borderColor: t.accent,
    },

    chooseCardSlate: {
      backgroundColor: "#111827",
      borderColor: t.border,
    },

    chooseCardIcon: {
      width: 52,
      height: 52,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
    },

    chooseCardIconBlue:  { backgroundColor: t.accentSurface },
    chooseCardIconSlate: { backgroundColor: t.surface },

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

    signInLink: {
      marginTop: 32,
      alignItems: "center",
    },

    signInText:     { color: t.textSecondary, fontSize: 14 },
    signInTextBold: { color: t.accent, fontWeight: "600" },

    // ── Form screens ──

    formContainer: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 40,
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

    inviteCodeInput: {
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
  }), [t]);

  //////////////////////////////////////////////////////
  // CHOOSE SCREEN
  //////////////////////////////////////////////////////

  if (mode === "choose") {
    return (
      <LinearGradient colors={[t.bg, t.surface]} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.chooseContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Logo / Title */}
          <View style={styles.logoWrap}>
            <View style={styles.logoIcon}>
              <Ionicons name="receipt-outline" size={36} color={t.accent} />
            </View>
            <Text style={styles.appTitle}>Claimio</Text>
            <Text style={styles.appSubtitle}>Expense management made simple</Text>
          </View>

          {/* Create card */}
          <TouchableOpacity
            style={[styles.chooseCard, styles.chooseCardBlue]}
            onPress={() => goTo("create")}
            activeOpacity={0.8}
          >
            <View style={[styles.chooseCardIcon, styles.chooseCardIconBlue]}>
              <Ionicons name="briefcase-outline" size={26} color={t.accent} />
            </View>
            <View style={styles.chooseCardText}>
              <Text style={styles.chooseCardTitle}>Create Organisation</Text>
              <Text style={styles.chooseCardSub}>I'm setting up my company</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.accent} />
          </TouchableOpacity>

          {/* Join card */}
          <TouchableOpacity
            style={[styles.chooseCard, styles.chooseCardSlate]}
            onPress={() => goTo("join")}
            activeOpacity={0.8}
          >
            <View style={[styles.chooseCardIcon, styles.chooseCardIconSlate]}>
              <Ionicons name="person-add-outline" size={26} color={t.textSecondary} />
            </View>
            <View style={styles.chooseCardText}>
              <Text style={styles.chooseCardTitle}>Join Organisation</Text>
              <Text style={styles.chooseCardSub}>I have an invite code</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.textSecondary} />
          </TouchableOpacity>

          {/* Sign in link */}
          <TouchableOpacity onPress={() => router.push("/sign-in")} style={styles.signInLink}>
            <Text style={styles.signInText}>
              Already have an account? <Text style={styles.signInTextBold}>Sign In</Text>
            </Text>
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
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          <ScrollView
            contentContainerStyle={styles.formContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Back */}
            <TouchableOpacity onPress={() => goTo("choose")} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={t.textSecondary} />
            </TouchableOpacity>

            {/* Header */}
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Create Organisation</Text>
              <Text style={styles.formSubtitle}>You'll be the admin</Text>
            </View>

            {/* Fields */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Organisation Name</Text>
              <TextInput
                value={organisation}
                onChangeText={setOrganisation}
                placeholder="e.g. Acme Corp"
                placeholderTextColor={t.textTertiary}
                style={styles.input}
                autoCapitalize="words"
              />
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
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={t.textTertiary}
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Min. 8 chars, 1 uppercase, 1 number"
                placeholderTextColor={t.textTertiary}
                style={styles.input}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Confirm Password</Text>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repeat password"
                placeholderTextColor={t.textTertiary}
                style={styles.input}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.btnDisabled]}
              onPress={handleCreate}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>
                {loading ? "Creating…" : "Create Account"}
              </Text>
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
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.formContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back */}
          <TouchableOpacity onPress={() => goTo("choose")} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={t.textSecondary} />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>Join Organisation</Text>
            <Text style={styles.formSubtitle}>Ask your admin for the invite code</Text>
          </View>

          {/* Invite Code */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Invite Code</Text>
            <TextInput
              value={inviteCode}
              onChangeText={(t) => setInviteCode(t.toUpperCase())}
              placeholder="e.g. ABC4X7"
              placeholderTextColor={t.textTertiary}
              style={[styles.input, styles.inviteCodeInput]}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
            />
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
            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={t.textTertiary}
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Min. 8 chars, 1 uppercase, 1 number"
              placeholderTextColor={t.textTertiary}
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Confirm Password</Text>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repeat password"
              placeholderTextColor={t.textTertiary}
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={handleJoin}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryBtnText}>
              {loading ? "Sending request…" : "Request to Join"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
