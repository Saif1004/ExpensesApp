import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import tw from "twrnc";
import { auth } from "./firebase/firebaseConfig";

export default function SignIn() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSignIn = async () => {
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <LinearGradient colors={["#020617", "#0F172A"]} style={{ flex: 1 }}>
      <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: "center" }}>
        <View
          style={[
            { borderRadius: 24, padding: 20, backgroundColor: "rgba(31,41,55,0.9)" },
            tw`shadow-lg`,
          ]}
        >
          <Text style={tw`text-slate-100 text-2xl font-bold mb-2`}>Sign In</Text>

          {/* Email */}
          <View style={tw`mb-4`}>
            <Text style={tw`text-slate-300 text-xs mb-1`}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor="#64748B"
              style={[
                { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 9999, borderWidth: 1 },
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
              secureTextEntry={true}
              style={[
                { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 9999, borderWidth: 1 },
                tw`border-slate-700 text-slate-100`,
              ]}
            />
          </View>

          <TouchableOpacity
            style={[{ paddingVertical: 12, borderRadius: 9999, alignItems: "center", marginBottom: 10 }, tw`bg-blue-500`]}
            onPress={handleSignIn}
          >
            <Text style={tw`text-white text-base font-semibold`}>Sign In</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/sign-up")}>
            <Text style={tw`text-slate-400 text-center text-xs mt-2`}>Don't have an account? Sign Up</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
}
