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

const LAST_SEEN_CLAIMS = "claims_last_seen";

export default function TabLayout() {

  const insets = useSafeAreaInsets();
  const { role, authLoaded, user } = useAuth();

  const [claimsBadge,setClaimsBadge] = useState(0);
  const [usersBadge,setUsersBadge] = useState(0);
  const [adminBadge,setAdminBadge] = useState(0);

  const isAdmin = role === "admin";

  //////////////////////////////////////////////////////
  // CLAIMS BADGE
  //////////////////////////////////////////////////////

  useEffect(()=>{

    if(!user) return;

    let unsubscribe:any;

    const setupListener = async() => {

      const lastSeen = await AsyncStorage.getItem(LAST_SEEN_CLAIMS);
      const lastSeenTime = lastSeen ? Number(lastSeen) : 0;

      const q = query(
        collection(db,"claims"),
        where("userId","==",user.uid)
      );

      unsubscribe = onSnapshot(q,(snapshot)=>{

        let count = 0;

        snapshot.docs.forEach((doc)=>{

          const data = doc.data();

          const created =
            data.createdAt?.seconds
              ? data.createdAt.seconds * 1000
              : 0;

          const updated =
            data.statusUpdatedAt?.seconds
              ? data.statusUpdatedAt.seconds * 1000
              : 0;

          const latest = Math.max(created,updated);

          if(latest > lastSeenTime){
            count++;
          }

        });

        setClaimsBadge(count);

      });

    };

    setupListener();

    return ()=> unsubscribe && unsubscribe();

  },[user]);

  //////////////////////////////////////////////////////
  // USERS BADGE (pending employees)
  //////////////////////////////////////////////////////

  useEffect(()=>{

    if(!user || !isAdmin) return;

    const q = query(
      collection(db,"memberships"),
      where("status","==","pending")
    );

    const unsubscribe = onSnapshot(q,(snap)=>{
      setUsersBadge(snap.size);
    });

    return unsubscribe;

  },[user,isAdmin]);

  //////////////////////////////////////////////////////
  // ADMIN BADGE (pending claims needing approval)
  //////////////////////////////////////////////////////

  useEffect(()=>{

    if(!user || !isAdmin) return;

    const q = query(
      collection(db,"claims"),
      where("status","==","pending")
    );

    const unsubscribe = onSnapshot(q,(snap)=>{
      setAdminBadge(snap.size);
    });

    return unsubscribe;

  },[user,isAdmin]);

  //////////////////////////////////////////////////////
  // CLEAR CLAIMS BADGE
  //////////////////////////////////////////////////////

  const clearClaimsBadge = async()=>{

    await AsyncStorage.setItem(
      LAST_SEEN_CLAIMS,
      Date.now().toString()
    );

    setClaimsBadge(0);

  };

  //////////////////////////////////////////////////////
  // CLEAR USERS BADGE
  //////////////////////////////////////////////////////

  const clearUsersBadge = ()=>{

    setUsersBadge(0);

  };

  //////////////////////////////////////////////////////
  // CLEAR ADMIN BADGE
  //////////////////////////////////////////////////////

  const clearAdminBadge = ()=>{

    setAdminBadge(0);

  };

  if(!authLoaded) return null;

  //////////////////////////////////////////////////////
  // TABS
  //////////////////////////////////////////////////////

  return (

    <Tabs
      screenOptions={{
        headerShown:false,
        tabBarActiveTintColor:"#FFFFFF",
        tabBarInactiveTintColor:"#64748B",
        tabBarShowLabel:true,

        tabBarStyle:{
          backgroundColor:"#0F172A",
          borderTopColor:"#1E293B",
          height:72 + insets.bottom,
          paddingBottom:insets.bottom + 12,
          paddingTop:10,
        },

        tabBarItemStyle:{
          justifyContent:"center",
          alignItems:"center",
        },

        tabBarLabelStyle:{
          fontSize:12,
          paddingTop:8,
          paddingBottom:14
        }
      }}
    >

      {/* HOME */}

      <Tabs.Screen
        name="home"
        options={{
          title:"Home",
          tabBarIcon:({color})=>(
            <IconSymbol name="house.fill" size={22} color={color}/>
          )
        }}
      />

      {/* CLAIM DETAILS HIDDEN */}

      <Tabs.Screen
        name="claims/[id]"
        options={{ href:null }}
      />

      {/* CLAIMS */}

      <Tabs.Screen
        name="claims"
        listeners={{
          tabPress: clearClaimsBadge
        }}
        options={{
          title:"Claims",
          tabBarBadge: claimsBadge > 0 ? claimsBadge : undefined,
          tabBarIcon:({color})=>(
            <IconSymbol name="doc.text.fill" size={22} color={color}/>
          )
        }}
      />

      {/* PROFILE */}

      <Tabs.Screen
        name="profile"
        options={{
          title:"Profile",
          tabBarIcon:({color})=>(
            <IconSymbol
              name="person.crop.circle.fill"
              size={22}
              color={color}
            />
          )
        }}
      />

      {/* ADD */}

      <Tabs.Screen
        name="add-expense"
        options={{
          title:"Add",
          tabBarIcon:({color})=>(
            <IconSymbol name="plus.circle.fill" size={26} color={color}/>
          )
        }}
      />

      {/* ANALYTICS */}

      <Tabs.Screen
        name="Analytics"
        options={{
          title:"Analytics",
          tabBarIcon:({color})=>(
            <IconSymbol name="chart.bar.xaxis" size={22} color={color}/>
          )
        }}
      />

      {/* ADMIN */}

      <Tabs.Screen
        name="admin"
        listeners={{
          tabPress: clearAdminBadge
        }}
        options={{
          title:"Admin",
          href:isAdmin ? undefined : null,
          tabBarBadge: adminBadge > 0 ? adminBadge : undefined,
          tabBarIcon:({color})=>(
            <IconSymbol name="shield.lefthalf.fill" size={22} color={color}/>
          )
        }}
      />

      {/* USERS APPROVAL */}

      <Tabs.Screen
        name="AdminUsers"
        listeners={{
          tabPress: clearUsersBadge
        }}
        options={{
          title:"Users",
          href:isAdmin ? undefined : null,
          tabBarBadge: usersBadge > 0 ? usersBadge : undefined,

          // ⭐ better icon for approvals
          tabBarIcon:({color})=>(
            <IconSymbol
              name="person.badge.clock.fill"
              size={22}
              color={color}
            />
          )
        }}
      />

      {/* HELP */}

      <Tabs.Screen
        name="chatbot"
        options={{
          title:"Help",
          tabBarIcon:({color})=>(
            <IconSymbol
              name="questionmark.circle.fill"
              size={22}
              color={color}
            />
          )
        }}
      />

    </Tabs>

  );
}