import { Stack } from "expo-router";
import { AuthProvider } from "./context/AuthProvider";
import { StripeProvider } from "@stripe/stripe-react-native";

const STRIPE_PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!;

export default function RootLayout() {
  return (
    <StripeProvider publishableKey={STRIPE_PK} merchantIdentifier="merchant.com.saif1004.claimio">
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </StripeProvider>
  );
}
