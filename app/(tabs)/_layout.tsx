import { Tabs } from "expo-router";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,

        // 🔥 FIXED COLORS
        tabBarActiveTintColor: "#FFFFFF",
        tabBarInactiveTintColor: "#FFFFFF",

        tabBarStyle: {
          backgroundColor: "#0F172A",
          borderTopColor: "#1E293B",
          height: 62,
          paddingBottom: 6,
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <IconSymbol name="house.fill" size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="Analytics"
        options={{
          title: "Analytics",
          tabBarIcon: ({ color }) => (
            <IconSymbol name="chart.bar.xaxis" size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="claims"
        options={{
          title: "Claims",
          tabBarIcon: ({ color }) => (
            <IconSymbol name="doc.text.fill" size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <IconSymbol name="person.crop.circle.fill" size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="add-expense"
        options={{
          title: "Add",
          tabBarIcon: ({ color }) => (
            <IconSymbol name="plus.circle.fill" size={30} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
