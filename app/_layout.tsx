import * as Sentry from "@sentry/react-native";
import { Ionicons } from "@expo/vector-icons";
import { StripeProvider } from "@stripe/stripe-react-native";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PostHogProvider, usePostHog } from "posthog-react-native";

// set up google sign-in once at startup
GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!,
  iosClientId:  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});

// kick off sentry before anything else loads
Sentry.init({
  dsn: "https://7ed0bbc868847a712d655357b3f2d554@o4511227413331968.ingest.de.sentry.io/4511227415429200",
  tracesSampleRate: 1.0,
  _experiments: { profilesSampleRate: 1.0 },
});
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, LogBox, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

// suppresses a harmless dev-mode warning from expo-keep-awake
LogBox.ignoreLogs(["Unable to activate keep awake"]);


import { ThemedText } from "../components/themed-text";
import { registerForPushNotifications } from "../utils/pushNotifications";
import { AuthProvider, useAuth } from "./context/AuthProvider";
import { ThemeProvider, useThemeContext } from "./context/ThemeContext";
import { db } from "./firebase/firebaseConfig";

const STRIPE_PK      = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!;
const POSTHOG_KEY    = process.env.EXPO_PUBLIC_POSTHOG_API_KEY!;
const POSTHOG_HOST   = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";
const TERMS_URL      = "https://doc-hosting.flycricket.io/claimio-terms-of-use/1f9b2874-dd4b-4eea-b8e0-6ad1c9ab563b/terms";
const PRIVACY_URL    = "https://doc-hosting.flycricket.io/claimio-privacy-policy/b73958a1-ae06-494d-b3a9-2c9b7183d4b3/privacy";

// terms gate — shown once on first login, acceptance stored in firestore

function TermsGate({ children }: { children: React.ReactNode }) {
  const { tokens: t } = useThemeContext();
  const { user, authLoaded } = useAuth();
  const posthog = usePostHog();
  const [visible, setVisible]   = useState(false);
  const [declined, setDeclined] = useState(false);
  const checkedUidRef = useRef<string | null>(null);

  useEffect(() => {
    // unverified users are still mid sign-up — showing this now would break the batch write
    if (!authLoaded || !user || !user.emailVerified) {
      setVisible(false);
      return;
    }
    // don't re-run for the same user
    if (checkedUidRef.current === user.uid) return;
    checkedUidRef.current = user.uid;

    const cacheKey = `tc_accepted_${user.uid}`;

    (async () => {
      // fast path: check local storage first
      const cached = await AsyncStorage.getItem(cacheKey).catch(() => null);
      if (cached === "true") return; // already done on this device

      // fall back to firestore — catches new device sign-ins
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.data()?.termsAccepted === true) {
          // accepted on another device, cache it so we skip the check next time
          await AsyncStorage.setItem(cacheKey, "true").catch(() => {});
          return;
        }
      } catch {
        // can't reach firestore, let them through
        return;
      }

      // hasn't accepted anywhere yet, show the modal
      setVisible(true);
    })();
  }, [authLoaded, user?.uid]);

  const styles = useMemo(() => StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: t.bg,
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: t.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 24,
      paddingTop: 12,
      paddingBottom: Platform.OS === "ios" ? 40 : 28,
      borderWidth: 1,
      borderColor: t.border,
      borderBottomWidth: 0,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: t.border,
      alignSelf: "center",
      marginBottom: 20,
    },
    iconRow: {
      alignItems: "center",
      marginBottom: 14,
    },
    iconWrap: {
      width: 60,
      height: 60,
      borderRadius: 18,
      backgroundColor: t.accentSurface,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: t.accent + "55",
    },
    title: {
      color: t.text,
      fontSize: 22,
      fontWeight: "800",
      textAlign: "center",
      marginBottom: 8,
    },
    body: {
      color: t.textSecondary,
      fontSize: 14,
      lineHeight: 22,
      textAlign: "center",
      marginBottom: 20,
    },
    scrollArea: {
      maxHeight: 200,
      backgroundColor: t.surfaceAlt ?? t.bg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      padding: 14,
      marginBottom: 20,
    },
    scrollText: {
      color: t.textSecondary,
      fontSize: 12,
      lineHeight: 19,
    },
    linksRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 20,
      marginBottom: 24,
    },
    linkBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    linkText: {
      color: t.accent,
      fontSize: 13,
      fontWeight: "600",
    },
    acceptBtn: {
      backgroundColor: t.accent,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: "center",
      marginBottom: 10,
    },
    acceptText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "700",
    },
    declineBtn: {
      paddingVertical: 12,
      alignItems: "center",
      marginBottom: 30,
    },
    declineText: {
      color: t.textTertiary,
      fontSize: 14,
    },
    declinedNote: {
      color: t.error ?? "#e53935",
      fontSize: 13,
      textAlign: "center",
      marginBottom: 12,
      fontWeight: "600",
    },
  }), [t]);

  const handleAccept = async () => {
    if (user) {
      const cacheKey = `tc_accepted_${user.uid}`;
      // save to both: firestore for cross-device, asyncstorage for instant lookup
      await Promise.allSettled([
        setDoc(doc(db, "users", user.uid), { termsAccepted: true }, { merge: true }),
        AsyncStorage.setItem(cacheKey, "true"),
      ]);
      posthog.capture("terms_accepted");
    }
    setVisible(false);
  };

  const handleDecline = () => setDeclined(true);

  return (
    <>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => { /* blocks the hardware back button */ }}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.handle} />

            <View style={styles.iconRow}>
              <View style={styles.iconWrap}>
                <Ionicons name="document-text" size={28} color={t.accent} />
              </View>
            </View>

            <ThemedText style={styles.title}>Before you continue</ThemedText>
            <ThemedText style={styles.body}>
              Please read and accept our Terms & Conditions and Privacy Policy to use Claimio.
            </ThemedText>

            <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
              <ThemedText style={styles.scrollText}>
                By tapping "Accept & Continue" you confirm that you:{"\n"}
                • Are at least 18 years old.{"\n"}
                • Agree to use Claimio only for legitimate business expense management.{"\n"}
                • Understand that expense data is stored securely on Google Cloud (Firebase).{"\n"}
                • Consent to Claimio processing your data as described in our Privacy Policy.{"\n"}
                • Acknowledge that subscriptions auto-renew unless cancelled before the renewal date.{"\n"}
                • Accept that Claimio is provided "as is" without warranty.{"\n\n"}
                These Terms are governed by the laws of England and Wales.{"\n"}
              </ThemedText>
            </ScrollView>

            <View style={styles.linksRow}>
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => Linking.openURL(TERMS_URL)}
                activeOpacity={0.7}
              >
                <Ionicons name="open-outline" size={14} color={t.accent} />
                <ThemedText style={styles.linkText}>Terms & Conditions</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => Linking.openURL(PRIVACY_URL)}
                activeOpacity={0.7}
              >
                <Ionicons name="open-outline" size={14} color={t.accent} />
                <ThemedText style={styles.linkText}>Privacy Policy</ThemedText>
              </TouchableOpacity>
            </View>

            {declined && (
              <ThemedText style={styles.declinedNote}>
                You must accept the Terms & Conditions to use Claimio.
              </ThemedText>
            )}

            <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept} activeOpacity={0.85}>
              <ThemedText style={styles.acceptText}>Accept & Continue</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity style={styles.declineBtn} onPress={handleDecline} activeOpacity={0.7}>
              <ThemedText style={styles.declineText}>Decline</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

// auto-tracks every screen view via expo-router's pathname

function ScreenTracker() {
  const pathname = usePathname();
  const posthog  = usePostHog();

  useEffect(() => {
    if (pathname) posthog.screen(pathname);
  }, [pathname]);

  return null;
}

// registers push tokens when a verified user signs in

function PushNotificationRegistrar() {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.uid && user.emailVerified) {
      registerForPushNotifications(user.uid);
    }
  }, [user?.uid, user?.emailVerified]);

  return null;
}

// wraps the app with providers

function AppShell() {
  const { tokens, isLoaded } = useThemeContext();

  if (!isLoaded) return null;
  return (
    <>
      <StatusBar style={tokens.statusBar === 'dark-content' ? 'dark' : 'light'} />
      <AuthProvider>
        <ScreenTracker />
        <PushNotificationRegistrar />
        <TermsGate>
          <Stack screenOptions={{ headerShown: false }} />
        </TermsGate>
      </AuthProvider>
    </>
  );
}

export default Sentry.wrap(function RootLayout() {
  return (
    <PostHogProvider apiKey={POSTHOG_KEY} options={{ host: POSTHOG_HOST }}>
      <StripeProvider publishableKey={STRIPE_PK} merchantIdentifier="merchant.com.saif1004.claimio">
        <ThemeProvider>
          <AppShell />
        </ThemeProvider>
      </StripeProvider>
    </PostHogProvider>
  );
});
