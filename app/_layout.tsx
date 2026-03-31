import { Stack } from "expo-router";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthProvider";
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

export default function RootLayout() {
  return (
    <StripeProvider publishableKey={STRIPE_PK} merchantIdentifier="merchant.com.saif1004.claimio">
      <AuthProvider>
        <PushNotificationRegistrar />
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </StripeProvider>
  );
}
