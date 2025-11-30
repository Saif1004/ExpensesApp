import { IconSymbol } from "@/components/ui/icon-symbol";
import { Tabs } from "expo-router";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        tabBarActiveTintColor: "#FFFFFF",
        tabBarInactiveTintColor: "#64748B",

        tabBarShowLabel: true,

        tabBarStyle: {
          backgroundColor: "#0F172A",
          borderTopColor: "#1E293B",
          // increase height + bottom padding so labels with descenders (p, y) are not clipped
          // and give some top room for ascenders (e.g. 'f')
          height: 72 + insets.bottom,
          paddingBottom: insets.bottom + 12,
          paddingTop: 10,
        },

        tabBarItemStyle: {
          justifyContent: "center",
          alignItems: "center",
        },
        tabBarIconStyle: { transform: [{ translateY: 0 }] },

        tabBarLabelStyle: {
          fontSize: 12,
          lineHeight: 18,
          paddingTop: 8,
          paddingBottom: 14,
          includeFontPadding: true,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <IconSymbol name="house.fill" size={22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="Analytics"
        options={{
          title: "Analytics",
          tabBarIcon: ({ color }) => (
            <IconSymbol name="chart.bar.xaxis" size={22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="claims"
        options={{
          title: "Claims",
          tabBarIcon: ({ color }) => (
            <IconSymbol name="doc.text.fill" size={22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <IconSymbol name="person.crop.circle.fill" size={22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="add-expense"
        options={{
          title: "Add",
          tabBarIcon: ({ color }) => (
            <IconSymbol name="plus.circle.fill" size={26} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
