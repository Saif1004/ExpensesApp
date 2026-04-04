import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  GoogleSignin,
} from "@react-native-google-signin/google-signin";
import * as AppleAuthentication from "expo-apple-authentication";
import {
  GoogleAuthProvider,
  OAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { useRef, useMemo, useState } from "react";
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
import { useTheme } from "../hooks/useTheme";
import GoogleLogo from "../components/GoogleLogo";

//////////////////////////////////////////////////////
// RATE LIMIT CONSTANTS
//////////////////////////////////////////////////////

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 15 * 60 * 1000; // 15 minutes

//////////////////////////////////////////////////////
// GOOGLE SIGN-IN CONFIG (once at module level)
//////////////////////////////////////////////////////

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});

export default function SignIn() {
  const router = useRouter();
  const { tokens: t } = useTheme();

  const [identifier, setIdentifier]     = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);

  // Client-side login rate limiting
  const failedAttemptsRef             = useRef(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  //////////////////////////////////////////////////////
  // FIND EMAIL FROM USERNAME
  //////////////////////////////////////////////////////

  const findEmailFromUsername = async (username: string): Promise<string | "OLD_ACCOUNT" | null> => {
    try {
      const normalized  = username.trim().toLowerCase();
      const usernameDoc = await getDoc(doc(db, "usernames", normalized));
      if (!usernameDoc.exists()) return null;
      const data = usernameDoc.data();
      if (data.email) return data.email;
      return "OLD_ACCOUNT";
    } catch {
      return null;
    }
  };

  //////////////////////////////////////////////////////
  // CHECK MEMBERSHIP
  //////////////////////////////////////////////////////

  const checkMembership = async (uid: string) => {
    try {
      const snap = await getDocs(query(collection(db, "memberships"), where("userId", "==", uid)));
      if (snap.empty) return { status: "none" };
      return snap.docs[0].data();
    } catch {
      return { status: "none" };
    }
  };

  //////////////////////////////////////////////////////
  // SOCIAL AUTH — shared membership routing
  //////////////////////////////////////////////////////

  const handleSocialAuth = async (uid: string) => {
    const membership = await checkMembership(uid);

    if (membership?.status === "approved") {
      failedAttemptsRef.current = 0;
      router.replace("/(tabs)/home");
    } else if (membership?.status === "pending") {
      await signOut(auth);
      Alert.alert(
        "Awaiting Approval",
        "Your admin hasn't approved your account yet. Please check back later."
      );
    } else {
      // New social user — needs to set up username + org
      router.replace("/social-onboarding");
    }
  };

  //////////////////////////////////////////////////////
  // GOOGLE SIGN-IN
  //////////////////////////////////////////////////////

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      const idToken  = (response as any).data?.idToken ?? (response as any).idToken;
      if (!idToken) throw new Error("No ID token returned");
      const credential = GoogleAuthProvider.credential(idToken);
      const result     = await signInWithCredential(auth, credential);
      await handleSocialAuth(result.user.uid);
    } catch (err: any) {
      const code = err?.code ?? "";
      if (
        code !== "SIGN_IN_CANCELLED" &&
        code !== "12501" /* Android cancelled */ &&
        err?.message !== "SIGN_IN_CANCELLED"
      ) {
        Alert.alert("Google Sign-In failed", "Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  //////////////////////////////////////////////////////
  // APPLE SIGN-IN
  //////////////////////////////////////////////////////

  const handleAppleSignIn = async () => {
    try {
      setLoading(true);
      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const provider       = new OAuthProvider("apple.com");
      const oauthCredential = provider.credential({
        idToken: appleCredential.identityToken!,
      });
      const result = await signInWithCredential(auth, oauthCredential);
      await handleSocialAuth(result.user.uid);
    } catch (err: any) {
      if (err?.code !== "ERR_REQUEST_CANCELED") {
        Alert.alert("Apple Sign-In failed", "Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  //////////////////////////////////////////////////////
  // SIGN IN (email / password)
  //////////////////////////////////////////////////////

  const handleSignIn = async () => {
    if (!identifier || !password) {
      Alert.alert("Missing details", "Enter your email or username and password.");
      return;
    }

    if (lockedUntil && Date.now() < lockedUntil) {
      const minsLeft = Math.ceil((lockedUntil - Date.now()) / 60_000);
      Alert.alert(
        "Too many attempts",
        `Account temporarily locked. Try again in ${minsLeft} minute${minsLeft !== 1 ? "s" : ""}.`
      );
      return;
    }

    try {
      setLoading(true);

      let email = identifier.trim();

      if (!identifier.includes("@")) {
        const foundEmail = await findEmailFromUsername(identifier.trim().toLowerCase());
        if (!foundEmail) {
          Alert.alert("User not found", "No account with that username.");
          return;
        }
        if (foundEmail === "OLD_ACCOUNT") {
          Alert.alert(
            "Sign in with email",
            "This account was created before username login was available. Please sign in with your email address instead."
          );
          return;
        }
        email = foundEmail;
      }

      const cred = await signInWithEmailAndPassword(auth, email, password);

      await cred.user.reload();
      await cred.user.getIdToken(true);

      if (!cred.user.emailVerified) {
        try { await sendEmailVerification(cred.user); } catch {}
        await signOut(auth);
        Alert.alert(
          "Email Not Verified",
          "A verification link has been sent to your inbox. Please verify your email before signing in."
        );
        return;
      }

      const uid        = cred.user.uid;
      const membership = await checkMembership(uid);

      if (membership?.status === "pending") {
        Alert.alert(
          "Awaiting Approval",
          "Your admin hasn't approved your account yet. Please check back later."
        );
        return;
      }

      if (membership?.status === "none") {
        Alert.alert("No Organisation", "You are not assigned to an organisation.");
        return;
      }

      failedAttemptsRef.current = 0;
      setLockedUntil(null);
      router.replace("/(tabs)/home");

    } catch (err: any) {
      const code = err?.code ?? "";

      if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password" ||
        code === "auth/user-not-found"
      ) {
        failedAttemptsRef.current += 1;
        const remaining = MAX_ATTEMPTS - failedAttemptsRef.current;

        if (failedAttemptsRef.current >= MAX_ATTEMPTS) {
          const until = Date.now() + LOCKOUT_MS;
          setLockedUntil(until);
          failedAttemptsRef.current = 0;
          Alert.alert(
            "Too many attempts",
            "Account temporarily locked for 15 minutes. Please try again later."
          );
        } else {
          Alert.alert(
            "Incorrect credentials",
            `Email or password is incorrect. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`
          );
        }
      } else if (code === "auth/too-many-requests") {
        Alert.alert("Too many attempts", "Account temporarily locked by the server. Try again later.");
      } else {
        Alert.alert("Sign in failed", "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  //////////////////////////////////////////////////////
  // FORGOT PASSWORD
  //////////////////////////////////////////////////////

  const forgotPassword = async () => {
    if (!identifier.trim()) {
      Alert.alert("Enter your details", "Type your email or username above, then tap Forgot Password.");
      return;
    }

    try {
      setLoading(true);

      let email = identifier.trim();

      if (!identifier.includes("@")) {
        const foundEmail = await findEmailFromUsername(identifier.trim().toLowerCase());
        if (!foundEmail || foundEmail === "OLD_ACCOUNT") {
          Alert.alert("Email sent", "If an account exists, you will receive a password reset email.");
          return;
        }
        email = foundEmail;
      }

      await sendPasswordResetEmail(auth, email);
      Alert.alert(
        "Email sent",
        "If an account exists with that email, you will receive password reset instructions."
      );
    } catch {
      Alert.alert("Email sent", "If an account exists, you will receive a password reset email.");
    } finally {
      setLoading(false);
    }
  };

  //////////////////////////////////////////////////////
  // STYLES
  //////////////////////////////////////////////////////

  const styles = useMemo(() => StyleSheet.create({
    gradient: { flex: 1 },
    kav: { flex: 1 },
    scroll: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingVertical: 48,
    },

    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 28,
      gap: 10,
    },
    logoBox: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: t.accentSurface,
      borderWidth: 1,
      borderColor: t.accent + "44",
      justifyContent: "center",
      alignItems: "center",
    },
    brandName: {
      color: t.text,
      fontSize: 26,
      fontWeight: "800",
      letterSpacing: 0.5,
    },

    heading: {
      color: t.text,
      fontSize: 28,
      fontWeight: "700",
      marginBottom: 6,
    },
    subheading: {
      color: t.textSecondary,
      fontSize: 15,
      marginBottom: 28,
    },

    card: {
      backgroundColor: t.surface,
      borderRadius: 20,
      padding: 20,
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: 24,
    },

    label: {
      color: t.textSecondary,
      fontSize: 12,
      fontWeight: "600",
      marginBottom: 6,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },

    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.surfaceAlt,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: 16,
      paddingHorizontal: 12,
    },
    inputIcon: {
      marginRight: 8,
    },
    input: {
      flex: 1,
      color: t.text,
      fontSize: 15,
      paddingVertical: 13,
    },
    eyeBtn: {
      padding: 4,
    },

    forgotBtn: {
      alignSelf: "flex-end",
      marginBottom: 20,
      marginTop: -8,
    },
    forgotText: {
      color: t.accent,
      fontSize: 13,
      fontWeight: "500",
    },

    lockoutBanner: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.errorSurface,
      borderRadius: 10,
      padding: 10,
      marginBottom: 14,
      gap: 8,
      borderWidth: 1,
      borderColor: t.errorSurface,
    },
    lockoutText: {
      color: t.error,
      fontSize: 13,
      flex: 1,
    },

    signInBtn: {
      backgroundColor: t.accent,
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: "center",
    },
    btnDisabled: { opacity: 0.6 },
    signInBtnText: {
      color: t.accentText,
      fontSize: 16,
      fontWeight: "700",
    },

    // ── Divider ──
    dividerRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: t.border,
    },
    dividerText: {
      color: t.textTertiary,
      fontSize: 12,
      marginHorizontal: 12,
    },

    // ── Social buttons ──
    socialRow: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 24,
    },
    socialBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 13,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
    },
    appleBtn: {
      backgroundColor: "#000",
      borderColor: "#000",
    },
    socialBtnText: {
      color: t.text,
      fontSize: 15,
      fontWeight: "600",
    },
    appleBtnText: {
      color: "#fff",
    },
    googleG: {
      fontSize: 16,
      fontWeight: "700",
      color: "#4285F4",
      width: 18,
      textAlign: "center",
    },

    signUpRow: {
      alignItems: "center",
    },
    signUpText: {
      color: t.textSecondary,
      fontSize: 14,
    },
    signUpLink: {
      color: t.accent,
      fontWeight: "600",
    },
  }), [t]);

  //////////////////////////////////////////////////////
  // UI
  //////////////////////////////////////////////////////

  const isLocked = !!(lockedUntil && Date.now() < lockedUntil);

  return (
    <LinearGradient colors={[t.bg, t.surface]} style={styles.gradient}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo / branding */}
          <View style={styles.brandRow}>
            <View style={styles.logoBox}>
              <Ionicons name="receipt-outline" size={28} color={t.accent} />
            </View>
            <Text style={styles.brandName}>Claimio</Text>
          </View>

          <Text style={styles.heading}>Welcome back</Text>
          <Text style={styles.subheading}>Sign in to your account</Text>

          {/* Card */}
          <View style={styles.card}>

            {/* Identifier */}
            <Text style={styles.label}>Email or Username</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={18} color={t.textTertiary} style={styles.inputIcon} />
              <TextInput
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="email or username"
                placeholderTextColor={t.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={styles.input}
                editable={!isLocked}
              />
            </View>

            {/* Password */}
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color={t.textTertiary} style={styles.inputIcon} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={t.textTertiary}
                secureTextEntry={!showPassword}
                style={[styles.input, { flex: 1 }]}
                editable={!isLocked}
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={styles.eyeBtn}>
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color={t.textTertiary}
                />
              </TouchableOpacity>
            </View>

            {/* Forgot password */}
            <TouchableOpacity onPress={forgotPassword} style={styles.forgotBtn} disabled={loading}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {/* Lockout warning */}
            {isLocked && (
              <View style={styles.lockoutBanner}>
                <Ionicons name="lock-closed" size={14} color={t.error} />
                <Text style={styles.lockoutText}>
                  Too many failed attempts. Try again in{" "}
                  {Math.ceil(((lockedUntil ?? 0) - Date.now()) / 60_000)} min.
                </Text>
              </View>
            )}

            {/* Sign in button */}
            <TouchableOpacity
              style={[styles.signInBtn, (loading || isLocked) && styles.btnDisabled]}
              onPress={handleSignIn}
              disabled={loading || isLocked}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color={t.accentText} />
                : <Text style={styles.signInBtnText}>Sign In</Text>
              }
            </TouchableOpacity>

          </View>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social buttons */}
          <View style={styles.socialRow}>
            {/* Google */}
            <TouchableOpacity
              style={[styles.socialBtn, loading && styles.btnDisabled]}
              onPress={handleGoogleSignIn}
              disabled={loading}
              activeOpacity={0.8}
            >
              <GoogleLogo size={20} />
              <Text style={styles.socialBtnText}>Google</Text>
            </TouchableOpacity>

            {/* Apple — iOS only */}
            {Platform.OS === "ios" && (
              <TouchableOpacity
                style={[styles.socialBtn, styles.appleBtn, loading && styles.btnDisabled]}
                onPress={handleAppleSignIn}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-apple" size={18} color="#fff" />
                <Text style={[styles.socialBtnText, styles.appleBtnText]}>Apple</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Sign up link */}
          <TouchableOpacity onPress={() => router.push("/sign-up")} style={styles.signUpRow}>
            <Text style={styles.signUpText}>
              Don't have an account?{" "}
              <Text style={styles.signUpLink}>Sign Up</Text>
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
