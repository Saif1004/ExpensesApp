import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StripeProvider } from "@stripe/stripe-react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { Linking, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { ThemedText } from "../components/themed-text";
import { registerForPushNotifications } from "../utils/pushNotifications";
import { AuthProvider, useAuth } from "./context/AuthProvider";
import { ThemeProvider, useThemeContext } from "./context/ThemeContext";

const STRIPE_PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!;
const TC_ACCEPTED_KEY = "@claimio_tc_accepted";
const TERMS_URL   = "https://doc-hosting.flycricket.io/claimio-terms-of-use/1f9b2874-dd4b-4eea-b8e0-6ad1c9ab563b/terms";
const PRIVACY_URL = "https://doc-hosting.flycricket.io/claimio-privacy-policy/b73958a1-ae06-494d-b3a9-2c9b7183d4b3/privacy";

//////////////////////////////////////////////////////
// T&C Gate — shown once on first launch
//////////////////////////////////////////////////////

function TermsGate({ children }: { children: React.ReactNode }) {
  const { tokens: t } = useThemeContext();
  const [checking, setChecking]   = useState(true);
  const [visible, setVisible]     = useState(false);
  const [declined, setDeclined]   = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(TC_ACCEPTED_KEY).then(val => {
      if (val !== "true") setVisible(true);
      setChecking(false);
    });
  }, []);

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
    await AsyncStorage.setItem(TC_ACCEPTED_KEY, "true");
    setVisible(false);
  };

  const handleDecline = () => {
    setDeclined(true);
  };

  if (checking) return null;

  return (
    <>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => { /* block hardware back */ }}
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
                By tapping "Accept & Continue" you confirm that you:{"\n\n"}
                • Are at least 18 years old{"\n"}
                • Agree to use Claimio only for legitimate business expense management{"\n"}
                • Understand that expense data is stored securely on Google Cloud (Firebase){"\n"}
                • Consent to Claimio processing your data as described in our Privacy Policy{"\n"}
                • Acknowledge that subscriptions auto-renew unless cancelled before the renewal date{"\n"}
                • Accept that Claimio is provided "as is" without warranty{"\n\n"}
                These Terms are governed by the laws of England and Wales{"\n"}
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

//////////////////////////////////////////////////////
// Push notification registrar
//////////////////////////////////////////////////////

function PushNotificationRegistrar() {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.uid && user.emailVerified) {
      registerForPushNotifications(user.uid);
    }
  }, [user?.uid, user?.emailVerified]);

  return null;
}

//////////////////////////////////////////////////////
// App shell
//////////////////////////////////////////////////////

function AppShell() {
  const { tokens, isLoaded } = useThemeContext();
  if (!isLoaded) return null;
  return (
    <TermsGate>
      <StatusBar style={tokens.statusBar === 'dark-content' ? 'dark' : 'light'} />
      <AuthProvider>
        <PushNotificationRegistrar />
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </TermsGate>
  );
}

export default function RootLayout() {
  return (
    <StripeProvider publishableKey={STRIPE_PK} merchantIdentifier="merchant.com.saif1004.claimio">
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </StripeProvider>
  );
}
