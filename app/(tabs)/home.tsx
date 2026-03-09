import { StyleSheet, TouchableOpacity, View } from "react-native";
import ParallaxScrollView from "../../components/parallax-scroll-view";
import { ThemedText } from "../../components/themed-text";
import { IconSymbol } from "../../components/ui/icon-symbol";

import { router } from "expo-router";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthProvider";
import { db } from "../firebase/firebaseConfig";

type Claim = {
  id: string;
  merchant: string;
  amount: number;
  category: string;
  status: string;
};

export default function HomeScreen() {

  const { user } = useAuth();

  const [monthlySpend,setMonthlySpend] = useState(0);
  const [pending,setPending] = useState(0);
  const [approved,setApproved] = useState(0);
  const [recent,setRecent] = useState<Claim[]>([]);

  /////////////////////////////////////////////////////////
  // Greeting
  /////////////////////////////////////////////////////////

  const hour = new Date().getHours();

  const greeting =
    hour < 12
      ? "Good morning"
      : hour < 18
      ? "Good afternoon"
      : "Good evening";

  /////////////////////////////////////////////////////////
  // Firestore listeners
  /////////////////////////////////////////////////////////

  useEffect(()=>{

    if(!user) return;

    const q = query(
      collection(db,"claims"),
      where("userId","==",user.uid)
    );

    const unsub = onSnapshot(q,(snapshot)=>{

      const claims = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Claim[];

      let spend = 0;
      let pendingCount = 0;
      let approvedCount = 0;

      claims.forEach(c=>{
        spend += Number(c.amount) || 0;

        if(c.status==="pending") pendingCount++;
        if(c.status==="approved") approvedCount++;
      });

      setMonthlySpend(spend);
      setPending(pendingCount);
      setApproved(approvedCount);

    });

    const recentQuery = query(
      collection(db,"claims"),
      where("userId","==",user.uid),
      orderBy("createdAt","desc"),
      limit(3)
    );

    const unsubRecent = onSnapshot(recentQuery,(snapshot)=>{

      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Claim[];

      setRecent(list);

    });

    return ()=>{
      unsub();
      unsubRecent();
    }

  },[user]);

  /////////////////////////////////////////////////////////
  // Progress calculation
  /////////////////////////////////////////////////////////

  const monthlyLimit = 2000;

  const progress =
    Math.min((monthlySpend / monthlyLimit) * 100,100);

  /////////////////////////////////////////////////////////
  // UI
  /////////////////////////////////////////////////////////

  return (

    <ParallaxScrollView
      headerBackgroundColor={{ light:"#0F172A", dark:"#0F172A" }}
      contentContainerStyle={styles.container}
      headerImage={
        <IconSymbol
          size={90}
          color="#ffffff"
          name="house.fill"
          style={styles.headerIcon}
        />
      }
    >

      {/* HEADER */}

      <ThemedText type="title" style={styles.title}>
        {greeting}
      </ThemedText>

      <ThemedText style={styles.subtitle}>
        Here's your expense overview
      </ThemedText>


      {/* SPENDING */}

      <View style={styles.spendingCard}>

        <ThemedText style={styles.spendingLabel}>
          Monthly Spending
        </ThemedText>

        <ThemedText style={styles.spendingAmount}>
          £{monthlySpend.toFixed(2)}
        </ThemedText>

        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress}%` }
            ]}
          />
        </View>

        <ThemedText style={styles.progressText}>
          £{monthlySpend.toFixed(2)} of £{monthlyLimit}
        </ThemedText>

      </View>


      {/* ACTIONS */}

      <View style={styles.actions}>

        <TouchableOpacity
          style={styles.action}
          onPress={()=>router.push("/add-expense")}
        >
          <IconSymbol name="plus.circle.fill" size={26} color="#60A5FA"/>
          <ThemedText style={styles.actionText}>Add</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.action}
          onPress={()=>router.push("/claims")}
        >
          <IconSymbol name="doc.text.fill" size={26} color="#60A5FA"/>
          <ThemedText style={styles.actionText}>Claims</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.action}
          onPress={()=>router.push("/Analytics")}
        >
          <IconSymbol name="chart.bar.xaxis" size={26} color="#60A5FA"/>
          <ThemedText style={styles.actionText}>Analytics</ThemedText>
        </TouchableOpacity>

      </View>


      {/* STATUS */}

      <View style={styles.statsRow}>

        <View style={styles.statCard}>
          <ThemedText style={styles.statLabel}>Pending</ThemedText>
          <ThemedText style={styles.statValue}>{pending}</ThemedText>
        </View>

        <View style={styles.statCard}>
          <ThemedText style={styles.statLabel}>Approved</ThemedText>
          <ThemedText style={styles.statValue}>{approved}</ThemedText>
        </View>

      </View>


      {/* RECENT */}

      <ThemedText style={styles.sectionTitle}>
        Recent Activity
      </ThemedText>

      {recent.length === 0 ? (

        <View style={styles.emptyState}>
          <IconSymbol
            name="doc.text.fill"
            size={40}
            color="#334155"
          />

          <ThemedText style={styles.emptyText}>
            No claims yet
          </ThemedText>
        </View>

      ) : (

        recent.map((claim)=>(
          <TouchableOpacity
            key={claim.id}
            style={styles.activityCard}

            // 🔥 navigate to the exact claim
            onPress={()=>router.push(`/claims/${claim.id}`)}

          >

            <View>
              <ThemedText style={styles.merchant}>
                {claim.merchant}
              </ThemedText>

              <ThemedText style={styles.meta}>
                {claim.category} • {claim.status}
              </ThemedText>
            </View>

            <ThemedText style={styles.amount}>
              £{claim.amount}
            </ThemedText>

          </TouchableOpacity>
        ))

      )}

    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({

container:{
padding:20
},

headerIcon:{
opacity:0.15
},

title:{
fontSize:30,
fontWeight:"700",
color:"#F8FAFC"
},

subtitle:{
color:"#94A3B8",
marginBottom:20
},

spendingCard:{
backgroundColor:"#1E293B",
padding:20,
borderRadius:16,
marginBottom:22,
borderWidth:1,
borderColor:"#334155"
},

spendingLabel:{
color:"#94A3B8"
},

spendingAmount:{
fontSize:32,
lineHeight:34,
fontWeight:"700",
color:"#60A5FA",
marginTop:4,
fontVariant:["tabular-nums"]
},

progressBar:{
height:8,
backgroundColor:"#334155",
borderRadius:6,
marginTop:10,
overflow:"hidden"
},

progressFill:{
height:"100%",
backgroundColor:"#60A5FA"
},

progressText:{
marginTop:6,
fontSize:12,
color:"#94A3B8"
},

actions:{
flexDirection:"row",
justifyContent:"space-between",
marginBottom:24
},

action:{
alignItems:"center",
flex:1
},

actionText:{
fontSize:12,
color:"#E2E8F0",
marginTop:6
},

statsRow:{
flexDirection:"row",
gap:12,
marginBottom:24
},

statCard:{
flex:1,
backgroundColor:"#1E293B",
padding:16,
borderRadius:16,
borderWidth:1,
borderColor:"#334155"
},

statLabel:{
color:"#94A3B8",
fontSize:12
},

statValue:{
fontSize:22,
fontWeight:"700",
color:"#F8FAFC",
marginTop:4
},

sectionTitle:{
fontSize:16,
fontWeight:"600",
color:"#E2E8F0",
marginBottom:12
},

activityCard:{
flexDirection:"row",
justifyContent:"space-between",
alignItems:"center",
backgroundColor:"#1E293B",
padding:16,
borderRadius:16,
marginBottom:10,
borderWidth:1,
borderColor:"#334155"
},

merchant:{
color:"#F8FAFC",
fontWeight:"600"
},

meta:{
color:"#94A3B8",
fontSize:12
},

amount:{
color:"#60A5FA",
fontWeight:"600"
},

emptyState:{
alignItems:"center",
padding:30
},

emptyText:{
color:"#94A3B8",
marginTop:10
}

});