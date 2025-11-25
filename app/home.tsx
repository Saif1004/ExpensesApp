import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import tw from "twrnc";

export default function Home() {
  const router = useRouter();

  return (
    <View
      style={[
        { flex: 1, justifyContent: "center", alignItems: "center" },
        tw`bg-white`
      ]}
    >
      <Text style={[{ fontSize: 28, fontWeight: "bold", marginBottom: 24 }]}>
        Home Screen
      </Text>

      <TouchableOpacity
        style={[
          { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 9999 },
          tw`bg-blue-600`
        ]}
        onPress={() => router.push("/sign-in")}
      >
        <Text style={[{ color: "white", fontSize: 18, fontWeight: "600" }]}>
          Go To Sign In
        </Text>
      </TouchableOpacity>
    </View>
  );
}
