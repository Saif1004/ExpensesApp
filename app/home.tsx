import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import tw from "twrnc";

export default function landing() {
  const router = useRouter();

  return (
    <LinearGradient
      colors={["#0D1117", "#111827", "#1F2937"]}
      style={{ flex: 1 }}
    >
      <View
        style={{
          flex: 1,
          paddingHorizontal: 24,
          paddingVertical: 32,
          justifyContent: "space-between",
        }}
      >
        <View>
          <Text style={[tw`text-2xl font-extrabold text-slate-400 mb-2`]}>Welcome back 👋</Text>

          <Text style={[tw`text-3xl font-extrabold text-slate-100 mb-3`]}>
            Corporate Expense Tracker
          </Text>

          <Text style={[tw`text-slate-400 text-base leading-relaxed`]}>
            Smart insights. Better budgeting. A revolutionary step towards managing company finances.
          </Text>
        </View>

        <View>
          <TouchableOpacity
            style={[
              {
                paddingVertical: 14,
                borderRadius: 9999,
                alignItems: "center",
                marginBottom: 12,
              },
              tw`bg-blue-500`,
            ]}
            onPress={() => router.push("/sign-up")}
          >
            <Text style={[tw`text-white text-lg font-semibold`]}>Get Started</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              {
                paddingVertical: 12,
                borderRadius: 9999,
                alignItems: "center",
                borderWidth: 1,
              },
              tw`border-slate-600`,
            ]}
            onPress={() => router.push("/sign-in")}
          >
            <Text style={[tw`text-slate-300 text-base`]}>
              I already have an account
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
}
