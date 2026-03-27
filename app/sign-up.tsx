import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword, signOut, updateProfile } from "firebase/auth";
import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "./context/AuthProvider";
import { auth, db } from "./firebase/firebaseConfig";

//////////////////////////////////////////////////////
// Helpers
//////////////////////////////////////////////////////

const generateInviteCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const usernameExists = async (username: string) => {
  const snap = await getDocs(query(collection(db, "usernames"), where("__name__", "==", username)));
  return !snap.empty;
};

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

  const [mode, setMode] = useState<Mode>("choose");

  // Shared fields
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    const trimmedUsername = username.trim();
    const normalizedUsername = trimmedUsername.toLowerCase();
    const trimmedEmail = email.trim();
    const trimmedOrg = organisation.trim();
    const normalizedOrg = trimmedOrg.toLowerCase();

    if (!trimmedOrg || !trimmedUsername || !trimmedEmail || !password || !confirmPassword) {
      Alert.alert("Missing details", "Please fill in all fields.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Weak password", "Password must be at least 6 characters.");
      return;
    }

    if (await usernameExists(normalizedUsername)) {
      Alert.alert("Username taken", "Please choose a different username.");
      return;
    }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      const uid = cred.user.uid;

      await updateProfile(cred.user, { displayName: trimmedUsername });

      const batch = writeBatch(db);

      const orgRef = doc(collection(db, "organisations"));
      const membershipRef = doc(collection(db, "memberships"));
      const userRef = doc(db, "users", uid);
      const usernameRef = doc(db, "usernames", normalizedUsername);

      const inviteCodeValue = generateInviteCode();

      batch.set(userRef, {
        uid,
        email: trimmedEmail,
        username: normalizedUsername,
        displayName: trimmedUsername,
        createdAt: serverTimestamp(),
        plan: "free"
      });

      batch.set(usernameRef, { uid });

      batch.set(orgRef, {
        name: trimmedOrg,
        nameLower: normalizedOrg,
        ownerId: uid,
        plan: "free",
        inviteCode: inviteCodeValue,
        aiCreditsRemaining: 0,
        aiCreditsResetAt: null,
        createdAt: serverTimestamp()
      });

      batch.set(membershipRef, {
        userId: uid,
        orgId: orgRef.id,
        role: "admin",
        status: "approved",
        createdAt: serverTimestamp()
      });

      await batch.commit();
      await refreshMembership();
      router.replace("/(tabs)/home");
    } catch (err: any) {
      console.log("CREATE ERROR:", err);
      const code = err?.code ?? "";
      if (code === "auth/email-already-in-use") {
        Alert.alert("Email in use", "An account with this email already exists.");
      } else {
        Alert.alert("Sign up failed", "Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  //////////////////////////////////////////////////////
  // JOIN (employee flow)
  //////////////////////////////////////////////////////

  const handleJoin = async () => {
    const trimmedCode = inviteCode.trim().toUpperCase();
    const trimmedUsername = username.trim();
    const normalizedUsername = trimmedUsername.toLowerCase();
    const trimmedEmail = email.trim();

    if (!trimmedCode || !trimmedUsername || !trimmedEmail || !password || !confirmPassword) {
      Alert.alert("Missing details", "Please fill in all fields.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Weak password", "Password must be at least 6 characters.");
      return;
    }

    if (await usernameExists(normalizedUsername)) {
      Alert.alert("Username taken", "Please choose a different username.");
      return;
    }

    setLoading(true);
    let createdUid: string | null = null;

    try {
      // 1. Create auth user
      const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      createdUid = cred.user.uid;
      const uid = createdUid;

      await updateProfile(cred.user, { displayName: trimmedUsername });

      // 2. Look up org by invite code
      const orgQuery = query(
        collection(db, "organisations"),
        where("inviteCode", "==", trimmedCode)
      );
      const orgSnap = await getDocs(orgQuery);

      if (orgSnap.empty) {
        // Delete the just-created auth user
        await cred.user.delete();
        Alert.alert("Invalid invite code", "Ask your admin for the correct code.");
        setLoading(false);
        return;
      }

      const orgId = orgSnap.docs[0].id;

      // 3. Write user doc, username doc, membership
      const batch = writeBatch(db);

      const userRef = doc(db, "users", uid);
      const usernameRef = doc(db, "usernames", normalizedUsername);
      const membershipRef = doc(collection(db, "memberships"));

      batch.set(userRef, {
        uid,
        email: trimmedEmail,
        username: normalizedUsername,
        displayName: trimmedUsername,
        createdAt: serverTimestamp(),
        plan: "free"
      });

      batch.set(usernameRef, { uid });

      batch.set(membershipRef, {
        userId: uid,
        orgId,
        role: "employee",
        status: "pending",
        createdAt: serverTimestamp()
      });

      await batch.commit();

      // 4. Sign out — must wait for approval
      await signOut(auth);

      Alert.alert(
        "Request Sent!",
        "Your admin needs to approve your account before you can log in."
      );

      router.replace("/sign-in");
    } catch (err: any) {
      console.log("JOIN ERROR:", err);
      const code = err?.code ?? "";
      if (code === "auth/email-already-in-use") {
        Alert.alert("Email in use", "An account with this email already exists.");
      } else {
        Alert.alert("Sign up failed", "Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  //////////////////////////////////////////////////////
  // CHOOSE SCREEN
  //////////////////////////////////////////////////////

  if (mode === "choose") {
    return (
      <LinearGradient colors={["#020617", "#0F172A"]} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.chooseContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Logo / Title */}
          <View style={styles.logoWrap}>
            <View style={styles.logoIcon}>
              <Ionicons name="receipt-outline" size={36} color="#38BDF8" />
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
              <Ionicons name="briefcase-outline" size={26} color="#2563EB" />
            </View>
            <View style={styles.chooseCardText}>
              <Text style={styles.chooseCardTitle}>Create Organisation</Text>
              <Text style={styles.chooseCardSub}>I'm setting up my company</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#2563EB" />
          </TouchableOpacity>

          {/* Join card */}
          <TouchableOpacity
            style={[styles.chooseCard, styles.chooseCardSlate]}
            onPress={() => goTo("join")}
            activeOpacity={0.8}
          >
            <View style={[styles.chooseCardIcon, styles.chooseCardIconSlate]}>
              <Ionicons name="person-add-outline" size={26} color="#94A3B8" />
            </View>
            <View style={styles.chooseCardText}>
              <Text style={styles.chooseCardTitle}>Join Organisation</Text>
              <Text style={styles.chooseCardSub}>I have an invite code</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          {/* Sign in link */}
          <TouchableOpacity onPress={() => router.push("/sign-in")} style={styles.signInLink}>
            <Text style={styles.signInText}>Already have an account? <Text style={styles.signInTextBold}>Sign In</Text></Text>
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
      <LinearGradient colors={["#020617", "#0F172A"]} style={styles.flex}>
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
              <Ionicons name="arrow-back" size={22} color="#94A3B8" />
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
                placeholderTextColor="#475569"
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
                placeholderTextColor="#475569"
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
                placeholderTextColor="#475569"
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
                placeholder="Min. 6 characters"
                placeholderTextColor="#475569"
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
                placeholderTextColor="#475569"
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
    <LinearGradient colors={["#020617", "#0F172A"]} style={styles.flex}>
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
            <Ionicons name="arrow-back" size={22} color="#94A3B8" />
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
              placeholderTextColor="#475569"
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
              placeholderTextColor="#475569"
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
              placeholderTextColor="#475569"
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
              placeholder="Min. 6 characters"
              placeholderTextColor="#475569"
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
              placeholderTextColor="#475569"
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

//////////////////////////////////////////////////////
// STYLES
//////////////////////////////////////////////////////

const styles = StyleSheet.create({

  flex: {
    flex: 1
  },

  // ── Choose screen ──

  chooseContainer: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 60
  },

  logoWrap: {
    alignItems: "center",
    marginBottom: 48
  },

  logoIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: "#0C2340",
    borderWidth: 1.5,
    borderColor: "#38BDF833",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16
  },

  appTitle: {
    color: "#F8FAFC",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 6
  },

  appSubtitle: {
    color: "#64748B",
    fontSize: 15,
    textAlign: "center"
  },

  chooseCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1.5,
    gap: 14
  },

  chooseCardBlue: {
    backgroundColor: "#0D1F3C",
    borderColor: "#2563EB"
  },

  chooseCardSlate: {
    backgroundColor: "#111827",
    borderColor: "#334155"
  },

  chooseCardIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center"
  },

  chooseCardIconBlue: {
    backgroundColor: "#1E3A8A22"
  },

  chooseCardIconSlate: {
    backgroundColor: "#1E293B"
  },

  chooseCardText: {
    flex: 1
  },

  chooseCardTitle: {
    color: "#F1F5F9",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 3
  },

  chooseCardSub: {
    color: "#64748B",
    fontSize: 13
  },

  signInLink: {
    marginTop: 32,
    alignItems: "center"
  },

  signInText: {
    color: "#64748B",
    fontSize: 14
  },

  signInTextBold: {
    color: "#38BDF8",
    fontWeight: "600"
  },

  // ── Form screens ──

  formContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40
  },

  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    marginBottom: 24
  },

  formHeader: {
    marginBottom: 32
  },

  formTitle: {
    color: "#F8FAFC",
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 6
  },

  formSubtitle: {
    color: "#64748B",
    fontSize: 15
  },

  fieldGroup: {
    marginBottom: 16
  },

  fieldLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8
  },

  input: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 15 : 11,
    color: "#F8FAFC",
    fontSize: 15
  },

  inviteCodeInput: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 4,
    color: "#38BDF8",
    textAlign: "center"
  },

  primaryBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8
  },

  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700"
  },

  btnDisabled: {
    opacity: 0.6
  }

});
