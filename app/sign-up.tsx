// app/sign-up.tsx
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useState } from "react";
import { Alert, Text, TextInput, TouchableOpacity, View } from "react-native";
import tw from "twrnc";
import { auth, db } from "./firebase/firebaseConfig";

export default function SignUp() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSignUp = async () => {
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      Alert.alert("Missing details", "Please enter email and password.");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Weak password", "Password must be at least 6 characters.");
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);

      // Create user profile doc (roles, admin dashboards, rules depend on this)
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        email: cred.user.email,
        role: "employee",
        createdAt: serverTimestamp(),
      });

      // Let AuthProvider handle redirects (usually to /(tabs)/home)
      // router.replace("/(tabs)/home"); // optional
    } catch (err: any) {
      Alert.alert("Sign up failed", err?.message ?? "Unknown error");
    }
  };

  return (
    <LinearGradient colors={["#020617", "#0F172A"]} style={{ flex: 1 }}>
      <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: "center" }}>
        <View
          style={[
            {
              borderRadius: 24,
              padding: 22,
              backgroundColor: "rgba(31,41,55,0.92)",
            },
            tw`shadow-lg`,
          ]}
        >
          <Text style={tw`text-slate-100 text-2xl font-bold mb-2`}>
            Create Account
          </Text>

          <Text style={tw`text-slate-400 mb-6`}>
            Sign up to start managing expenses.
          </Text>

          {/* Email */}
          <View style={tw`mb-4`}>
            <Text style={tw`text-slate-300 text-xs mb-1`}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#64748B"
              keyboardType="email-address"
              autoCapitalize="none"
              style={[
                {
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 9999,
                  borderWidth: 1,
                },
                tw`border-slate-700 text-slate-100`,
              ]}
            />
          </View>

          {/* Password */}
          <View style={tw`mb-6`}>
            <Text style={tw`text-slate-300 text-xs mb-1`}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#64748B"
              secureTextEntry
              style={[
                {
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 9999,
                  borderWidth: 1,
                },
                tw`border-slate-700 text-slate-100`,
              ]}
            />
          </View>

          <TouchableOpacity
            style={[
              {
                paddingVertical: 12,
                borderRadius: 9999,
                alignItems: "center",
                marginBottom: 12,
              },
              tw`bg-blue-600`,
            ]}
            onPress={handleSignUp}
          >
            <Text style={tw`text-white text-base font-semibold`}>
              Create Account
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace("/sign-in")}>
            <Text style={tw`text-slate-400 text-center text-xs`}>
              Already have an account? Sign In
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
}