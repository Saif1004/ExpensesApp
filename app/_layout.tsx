import { Stack } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./context/AuthProvider";
import { ThemeProvider, useThemeContext } from "./context/ThemeContext";
import { StripeProvider } from "@stripe/stripe-react-native";
import { registerForPushNotifications } from "../utils/pushNotifications";

const STRIPE_PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!;

function PushNotificationRegistrar() {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.uid && user.emailVerified) {
      registerForPushNotifications(user.uid);
    }
  }, [user?.uid, user?.emailVerified]);

  return null;
}

function AppShell() {
  const { tokens, isLoaded } = useThemeContext();
  if (!isLoaded) return null;
  return (
    <>
      <StatusBar style={tokens.statusBar === 'dark-content' ? 'dark' : 'light'} />
      <AuthProvider>
        <PushNotificationRegistrar />
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </>
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
