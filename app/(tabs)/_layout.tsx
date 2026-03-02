import AsyncStorage from "@react-native-async-storage/async-storage";
import { Tabs } from "expo-router";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconSymbol } from "../../components/ui/icon-symbol";
import { useAuth } from "../context/AuthProvider";
import { db } from "../firebase/firebaseConfig";

const LAST_SEEN_KEY = "claims_last_seen";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { role, authLoaded, user } = useAuth();
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    let unsubscribe: any;

    const setupListener = async () => {
      const lastSeen = await AsyncStorage.getItem(LAST_SEEN_KEY);
      const lastSeenTime = lastSeen ? Number(lastSeen) : 0;

      // ✅ QUERY-SAFE LISTENER (CRITICAL FIX)
      const q = query(
        collection(db, "claims"),
        where("userId", "==", user.uid)
      );

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          let count = 0;

          snapshot.docs.forEach((doc) => {
            const data = doc.data();

            const created =
              data.createdAt?.seconds
                ? data.createdAt.seconds * 1000
                : 0;

            const updated =
              data.statusUpdatedAt?.seconds
                ? data.statusUpdatedAt.seconds * 1000
                : 0;

            const latestTime = Math.max(created, updated);

            if (latestTime > lastSeenTime) {
              count++;
            }
          });

          setNotificationCount(count);
        },
        (error) => {
          console.log("TAB LISTENER ERROR:", error);
        }
      );
    };

    setupListener();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  if (!authLoaded) return null;

  const isAdmin = role === "admin";

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
        name="claims"
        options={{
          title: "Claims",
          tabBarBadge:
            notificationCount > 0 ? notificationCount : undefined,
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
            <IconSymbol
              name="person.crop.circle.fill"
              size={22}
              color={color}
            />
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

      <Tabs.Screen
        name="Analytics"
        options={{
          title: "Analytics",
          tabBarIcon: ({ color }) => (
            <IconSymbol
              name="chart.bar.xaxis"
              size={22}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          href: isAdmin ? undefined : null, // 🔥 hides for employees
          tabBarIcon: ({ color }) => (
            <IconSymbol name="shield.fill" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}