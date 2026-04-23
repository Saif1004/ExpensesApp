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

// client-side rate limit config

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 15 * 60 * 1000; // 15 minutes

export default function SignIn() {
  const router = useRouter();
  const { tokens: t, mode } = useTheme();
  const isDark = mode === "dark";

  const [identifier, setIdentifier]     = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);

  // track failed logins for client-side lockout
  const failedAttemptsRef             = useRef(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  // looks up the email for a given username

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

  // checks membership status before deciding where to route

  const checkMembership = async (uid: string) => {
    try {
      const snap = await getDocs(query(collection(db, "memberships"), where("userId", "==", uid)));
      if (snap.empty) return { status: "none" };
      return snap.docs[0].data();
    } catch {
      return { status: "none" };
    }
  };

  // handles the membership check after google/apple sign-in

  const handleSocialAuth = async (uid: string) => {
    const membership = await checkMembership(uid);

    if (membership?.status === "pending") {
      await signOut(auth);
      Alert.alert(
        "Awaiting Approval",
        "Your admin hasn't approved your account yet. Please check back later."
      );
    }
    // authprovider handles the rest of the routing once membership loads
  };

  // google oauth sign-in

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signOut(); // force the account picker to show each time
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

  // apple sign-in (ios only)

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

  // email + password sign-in with lockout logic

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

  // sends a password reset email

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

  // all styles for this screen

  const styles = useMemo(() => StyleSheet.create({
    gradient: { flex: 1, backgroundColor: t.bg },
    kav: { flex: 1 },
    scroll: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingVertical: 52,
    },

    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 40,
      gap: 10,
    },
    logoBox: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: t.accent,
      justifyContent: "center",
      alignItems: "center",
    },
    brandName: {
      color: t.text,
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: -0.5,
    },

    heading: {
      color: t.text,
      fontSize: 34,
      fontWeight: "800",
      letterSpacing: -1,
      marginBottom: 6,
    },
    subheading: {
      color: t.textSecondary,
      fontSize: 16,
      lineHeight: 24,
      marginBottom: 36,
    },

    label: {
      color: t.textSecondary,
      fontSize: 11,
      fontWeight: "700",
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },

    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: 14,
      paddingHorizontal: 14,
    },
    inputIcon: {
      marginRight: 10,
    },
    input: {
      flex: 1,
      color: t.text,
      fontSize: 16,
      paddingVertical: 14,
    },
    eyeBtn: {
      padding: 4,
    },

    forgotBtn: {
      alignSelf: "flex-end",
      marginBottom: 24,
      marginTop: -4,
    },
    forgotText: {
      color: t.textSecondary,
      fontSize: 13,
      fontWeight: "500",
    },

    lockoutBanner: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.errorSurface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 14,
      gap: 8,
    },
    lockoutText: {
      color: t.error,
      fontSize: 13,
      flex: 1,
    },

    signInBtn: {
      backgroundColor: t.accent,
      borderRadius: 999,
      paddingVertical: 16,
      alignItems: "center",
      marginBottom: 32,
    },
    btnDisabled: { opacity: 0.5 },
    signInBtnText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "700",
      letterSpacing: -0.2,
    },

    // divider between email and social buttons
    dividerRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 20,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: t.border,
    },
    dividerText: {
      color: t.textTertiary,
      fontSize: 12,
      marginHorizontal: 14,
    },

    // social sign-in buttons
    socialRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 32,
    },
    socialBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
    },
    appleBtn: {
      backgroundColor: isDark ? "#FFFFFF" : "#000000",
      borderColor: isDark ? "#FFFFFF" : "#000000",
    },
    socialBtnText: {
      color: t.text,
      fontSize: 15,
      fontWeight: "600",
    },
    appleBtnText: {
      color: isDark ? "#000000" : "#FFFFFF",
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
      color: t.text,
      fontWeight: "700",
    },
  }), [t, isDark]);

  // the actual sign-in screen

  const isLocked = !!(lockedUntil && Date.now() < lockedUntil);

  return (
    <View style={styles.gradient}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* logo */}
          <View style={styles.brandRow}>
            <View style={styles.logoBox}>
              <Ionicons name="receipt-outline" size={22} color="#FFFFFF" />
            </View>
            <Text style={styles.brandName}>Claimio</Text>
          </View>

          <Text style={styles.heading}>Welcome back</Text>
          <Text style={styles.subheading}>Sign in to continue</Text>

          {/* email or username */}
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

          {/* password */}
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

          {/* forgot password link */}
          <TouchableOpacity onPress={forgotPassword} style={styles.forgotBtn} disabled={loading}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          {/* lockout banner */}
          {isLocked && (
            <View style={styles.lockoutBanner}>
              <Ionicons name="lock-closed" size={14} color={t.error} />
              <Text style={styles.lockoutText}>
                Too many failed attempts. Try again in{" "}
                {Math.ceil(((lockedUntil ?? 0) - Date.now()) / 60_000)} min.
              </Text>
            </View>
          )}

          {/* sign in button */}
          <TouchableOpacity
            style={[styles.signInBtn, (loading || isLocked) && styles.btnDisabled]}
            onPress={handleSignIn}
            disabled={loading || isLocked}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.signInBtnText}>Sign In</Text>
            }
          </TouchableOpacity>

          {/* or divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* google and apple sign-in */}
          <View style={styles.socialRow}>
            {/* google */}
            <TouchableOpacity
              style={[styles.socialBtn, loading && styles.btnDisabled]}
              onPress={handleGoogleSignIn}
              disabled={loading}
              activeOpacity={0.8}
            >
              <GoogleLogo size={20} />
              <Text style={styles.socialBtnText}>Google</Text>
            </TouchableOpacity>

            {/* apple (ios only) */}
            {Platform.OS === "ios" && (
              <TouchableOpacity
                style={[styles.socialBtn, styles.appleBtn, loading && styles.btnDisabled]}
                onPress={handleAppleSignIn}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-apple" size={18} color={isDark ? "#000000" : "#FFFFFF"} />
                <Text style={[styles.socialBtnText, styles.appleBtnText]}>Apple</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* link to sign up */}
          <TouchableOpacity onPress={() => router.push("/sign-up")} style={styles.signUpRow}>
            <Text style={styles.signUpText}>
              Don't have an account?{" "}
              <Text style={styles.signUpLink}>Sign Up</Text>
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
