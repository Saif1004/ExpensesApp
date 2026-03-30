import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../context/AuthProvider";
import { db } from "../firebase/firebaseConfig";
import { addListener } from "../../utils/listenerStore";

const LAST_SEEN_CLAIMS = "claims_last_seen";

// Raised centre Add button
function AddIcon() {
  return (
    <View
      style={{
        width: 52,
        height: 52,
        backgroundColor: "#2563EB",
        borderRadius: 16,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 6,
        shadowColor: "#2563EB",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 8,
        elevation: 8,
      }}
    >
      <Ionicons name="add" size={30} color="#fff" />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { role, authLoaded, user, orgId } = useAuth();

  const [claimsBadge, setClaimsBadge] = useState(0);
  const [usersBadge, setUsersBadge] = useState(0);
  const [adminBadge, setAdminBadge] = useState(0);

  const isAdmin = role === "admin";

  //////////////////////////////////////////////////////
  // CLAIMS BADGE (employee — updated claims)
  //////////////////////////////////////////////////////

  useEffect(() => {
    // Only listen once user is verified — prevents permission-denied with stale JWT
    if (!user || !user.emailVerified) return;
    let unsubscribe: any;

    const setup = async () => {
      const lastSeen = await AsyncStorage.getItem(LAST_SEEN_CLAIMS);
      const lastSeenTime = lastSeen ? Number(lastSeen) : 0;

      // Filter by userId — Firestore rules allow reads where userId == auth.uid
      const q = query(
        collection(db, "claims"),
        where("userId", "==", user.uid)
      );

      unsubscribe = addListener(
        onSnapshot(q, (snapshot) => {
          let count = 0;
          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            const created = data.createdAt?.seconds ? data.createdAt.seconds * 1000 : 0;
            const updated = data.statusUpdatedAt?.seconds ? data.statusUpdatedAt.seconds * 1000 : 0;
            if (Math.max(created, updated) > lastSeenTime) count++;
          });
          setClaimsBadge(count);
        }, () => { /* silently swallow permission-denied on sign-out/delete */ })
      );
    };

    setup();
    return () => unsubscribe && unsubscribe();
  }, [user]);

  //////////////////////////////////////////////////////
  // USERS BADGE (pending employee approvals)
  //////////////////////////////////////////////////////

  useEffect(() => {
    // orgId required — admin queries MUST be scoped to the org.
    // Without it the query spans all orgs → Firestore rules deny the whole query.
    if (!user || !user.emailVerified || !isAdmin || !orgId) return;
    const q = query(
      collection(db, "memberships"),
      where("orgId",  "==", orgId),
      where("status", "==", "pending")
    );
    const unsub = addListener(onSnapshot(q, (snap) => setUsersBadge(snap.size), () => {}));
    return unsub;
  }, [user, isAdmin, orgId]);

  //////////////////////////////////////////////////////
  // ADMIN BADGE (pending claims)
  //////////////////////////////////////////////////////

  useEffect(() => {
    if (!user || !user.emailVerified || !isAdmin || !orgId) return;
    const q = query(
      collection(db, "claims"),
      where("orgId",  "==", orgId),
      where("status", "==", "pending")
    );
    const unsub = addListener(onSnapshot(q, (snap) => setAdminBadge(snap.size), () => {}));
    return unsub;
  }, [user, isAdmin, orgId]);

  if (!authLoaded) return null;

  const TAB_HEIGHT = 64;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#38BDF8",
        tabBarInactiveTintColor: "#475569",
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: "#0A1628",
          borderTopWidth: 1,
          borderTopColor: "#1E293B",
          height: TAB_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },
        tabBarItemStyle: {
          justifyContent: "center",
          alignItems: "center",
        },
      }}
    >
      {/* ── HOME ── */}
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
          ),
        }}
      />

      {/* ── CLAIMS (employee only) ── */}
      <Tabs.Screen
        name="claims"
        listeners={{ tabPress: () => AsyncStorage.setItem(LAST_SEEN_CLAIMS, Date.now().toString()).then(() => setClaimsBadge(0)) }}
        options={{
          title: "Claims",
          href: isAdmin ? null : undefined,
          tabBarBadge: claimsBadge > 0 ? claimsBadge : undefined,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "document-text" : "document-text-outline"} size={22} color={color} />
          ),
        }}
      />

      {/* ── APPROVE (admin only) ── */}
      <Tabs.Screen
        name="admin"
        listeners={{ tabPress: () => setAdminBadge(0) }}
        options={{
          title: "Approve",
          href: isAdmin ? undefined : null,
          tabBarBadge: adminBadge > 0 ? adminBadge : undefined,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "checkmark-circle" : "checkmark-circle-outline"} size={22} color={color} />
          ),
        }}
      />

      {/* ── ADD EXPENSE (centre) ── */}
      <Tabs.Screen
        name="add-expense"
        options={{
          title: "",
          tabBarIcon: () => <AddIcon />,
        }}
      />

      {/* ── ANALYTICS (employee) / TEAM (admin) ── */}
      <Tabs.Screen
        name="Analytics"
        options={{
          title: "Analytics",
          href: isAdmin ? null : undefined,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "bar-chart" : "bar-chart-outline"} size={22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="AdminUsers"
        listeners={{ tabPress: () => setUsersBadge(0) }}
        options={{
          title: "Team",
          href: isAdmin ? undefined : null,
          tabBarBadge: usersBadge > 0 ? usersBadge : undefined,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "people" : "people-outline"} size={22} color={color} />
          ),
        }}
      />

      {/* ── PROFILE ── */}
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person-circle" : "person-circle-outline"} size={24} color={color} />
          ),
        }}
      />

      {/* ── HIDDEN SCREENS (navigable but not in tab bar) ── */}
      <Tabs.Screen name="claims/[id]" options={{ href: null }} />
      <Tabs.Screen name="chatbot"     options={{ href: null }} />
    </Tabs>
  );
}
