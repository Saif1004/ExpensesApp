import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where
} from "firebase/firestore";

import { useEffect, useState } from "react";

import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View
} from "react-native";

import { router } from "expo-router";

import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";

import { useAuth } from "../context/AuthProvider";
import { db } from "../firebase/firebaseConfig";

const LAST_SEEN_KEY = "claims_last_seen";

type Claim = {
  id: string;
  amount: number;
  merchant: string;
  category: string;
  status: "pending" | "approved" | "rejected";
  createdAt: Timestamp;
  receiptUrl?: string;
};

export default function ClaimsScreen() {

  const { user } = useAuth();

  const [allClaims,setAllClaims] = useState<Claim[]>([]);
  const [claims,setClaims] = useState<Claim[]>([]);

  const [counts,setCounts] = useState({
    pending:0,
    approved:0,
    rejected:0
  });

  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);

  const [filter,setFilter] =
    useState<"pending"|"approved"|"rejected">("pending");

  const [viewReceipt,setViewReceipt] =
    useState<string | null>(null);

  /////////////////////////////////////////////////////////
  // Reset badge
  /////////////////////////////////////////////////////////

  useEffect(()=>{
    AsyncStorage.setItem(LAST_SEEN_KEY,Date.now().toString());
  },[]);

  /////////////////////////////////////////////////////////
  // Firestore
  /////////////////////////////////////////////////////////

  useEffect(()=>{

    if(!user) return;

    const q = query(
      collection(db,"claims"),
      where("userId","==",user.uid),
      orderBy("createdAt","desc")
    );

    const unsub = onSnapshot(q,(snapshot)=>{

      const data:Claim[] = snapshot.docs.map((doc)=>({
        id:doc.id,
        ...(doc.data() as Omit<Claim,"id">)
      }));

      setAllClaims(data);

      const temp={
        pending:0,
        approved:0,
        rejected:0
      };

      data.forEach(c=>{
        temp[c.status]++;
      });

      setCounts(temp);

      setLoading(false);
      setRefreshing(false);

    });

    return unsub;

  },[user]);

  /////////////////////////////////////////////////////////
  // Filter
  /////////////////////////////////////////////////////////

  useEffect(()=>{
    setClaims(allClaims.filter(c=>c.status===filter));
  },[filter,allClaims]);

  /////////////////////////////////////////////////////////
  // Pull refresh
  /////////////////////////////////////////////////////////

  const onRefresh=()=>{
    setRefreshing(true);
    setTimeout(()=>setRefreshing(false),600);
  };

  /////////////////////////////////////////////////////////
  // Badge style
  /////////////////////////////////////////////////////////

  const getStatusStyle=(status:string)=>{
    switch(status){
      case "approved": return styles.approved;
      case "pending": return styles.pending;
      case "rejected": return styles.rejected;
      default: return styles.pending;
    }
  };

  /////////////////////////////////////////////////////////
  // UI
  /////////////////////////////////////////////////////////

  return(

    <ThemedView style={styles.container}>

      <ThemedText type="title" style={styles.title}>
        Claims
      </ThemedText>

      {/* Filters */}

      <View style={styles.filterRow}>

        {["pending","approved","rejected"].map((status)=>(
          <TouchableOpacity
            key={status}
            onPress={()=>setFilter(status as any)}
            style={[
              styles.filterBtn,
              filter===status && styles.filterActive
            ]}
          >

            <ThemedText
              style={
                filter===status
                  ? styles.filterTextActive
                  : styles.filterText
              }
            >
              {status.toUpperCase()} (
              {counts[status as keyof typeof counts]})
            </ThemedText>

          </TouchableOpacity>
        ))}

      </View>

      {/* Content */}

      {loading ? (

        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8"/>
        </View>

      ) : claims.length===0 ? (

        <View style={styles.card}>
          <ThemedText style={{color:"#94A3B8"}}>
            No {filter} claims
          </ThemedText>
        </View>

      ) : (

        <FlatList
          data={claims}
          keyExtractor={(item)=>item.id}
          style={{flex:1}}
          contentContainerStyle={{paddingBottom:40}}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#38BDF8"
            />
          }
          renderItem={({item})=>(

            <TouchableOpacity
              style={styles.claimCard}
              onPress={()=>router.push(`/claims/${item.id}`)}
            >

              <ThemedText style={styles.amount}>
                £{item.amount.toFixed(2)}
              </ThemedText>

              <ThemedText style={styles.meta}>
                {item.merchant} • {item.category}
              </ThemedText>

              <View style={[styles.statusBadge,getStatusStyle(item.status)]}>
                <ThemedText style={styles.statusText}>
                  {item.status.toUpperCase()}
                </ThemedText>
              </View>

              {item.receiptUrl && (
                <TouchableOpacity
                  onPress={()=>setViewReceipt(item.receiptUrl!)}
                >
                  <Image
                    source={{uri:item.receiptUrl}}
                    style={styles.receiptPreview}
                  />
                </TouchableOpacity>
              )}

            </TouchableOpacity>

          )}
        />

      )}

      {/* Receipt modal */}

      <Modal visible={!!viewReceipt} transparent animationType="fade">

        <View style={styles.imageModalOverlay}>

          {viewReceipt && (
            <Image
              source={{uri:viewReceipt}}
              style={styles.fullImage}
              resizeMode="contain"
            />
          )}

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={()=>setViewReceipt(null)}
          >
            <ThemedText style={{color:"#fff"}}>
              Close
            </ThemedText>
          </TouchableOpacity>

        </View>

      </Modal>

    </ThemedView>

  );
}

const styles = StyleSheet.create({

container:{
flex:1,
backgroundColor:"#0F172A",
padding:20
},

title:{
fontSize:30,
fontWeight:"bold",
color:"#F8FAFC"
},

filterRow:{
flexDirection:"row",
marginVertical:16,
gap:10
},

filterBtn:{
paddingVertical:6,
paddingHorizontal:12,
borderRadius:20,
backgroundColor:"#1E293B"
},

filterActive:{
backgroundColor:"#2563EB"
},

filterText:{
color:"#94A3B8",
fontSize:12
},

filterTextActive:{
color:"#FFFFFF",
fontSize:12
},

card:{
backgroundColor:"#1E293B",
padding:18,
borderRadius:14
},

claimCard:{
backgroundColor:"#1E293B",
padding:16,
borderRadius:14,
marginBottom:14,
borderWidth:1,
borderColor:"#334155"
},

amount:{
fontSize:18,
fontWeight:"bold",
color:"#F8FAFC"
},

meta:{
marginTop:4,
color:"#94A3B8"
},

statusBadge:{
marginTop:10,
alignSelf:"flex-start",
paddingHorizontal:12,
paddingVertical:6,
borderRadius:8
},

statusText:{
color:"#fff",
fontSize:12,
fontWeight:"600"
},

pending:{backgroundColor:"#FACC15"},
approved:{backgroundColor:"#22C55E"},
rejected:{backgroundColor:"#EF4444"},

receiptPreview:{
width:"100%",
height:120,
borderRadius:10,
marginTop:10
},

center:{
flex:1,
justifyContent:"center",
alignItems:"center"
},

imageModalOverlay:{
flex:1,
backgroundColor:"rgba(0,0,0,0.95)",
justifyContent:"center",
alignItems:"center",
padding:20
},

fullImage:{
width:"100%",
height:"80%"
},

closeBtn:{
marginTop:16,
backgroundColor:"#2563EB",
padding:12,
borderRadius:12,
alignItems:"center"
}

});