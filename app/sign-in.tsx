import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import tw from "twrnc";

export default function SignIn() {
  const router = useRouter();

  return (
    <View
      style={[
        { flex: 1, justifyContent: "center", alignItems: "center" },
        tw`bg-white`
      ]}
    >
      <Text style={[{ fontSize: 24, fontWeight: "bold", marginBottom: 24 }]}>
        Sign In
      </Text>

      <TouchableOpacity
        style={[
          { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 9999 },
          tw`bg-blue-600`
        ]}
        onPress={() => router.push("/")}
      >
        <Text style={[{ color: "white", fontSize: 18, fontWeight: "600" }]}>
          Home
        </Text>
      </TouchableOpacity>
    </View>
  );
}
