import { router, useLocalSearchParams } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";

import {
    ActivityIndicator,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "../../../components/themed-text";
import { IconSymbol } from "../../../components/ui/icon-symbol";
import { db } from "../../firebase/firebaseConfig";

type Claim = {
  merchant: string;
  amount: number;
  category: string;
  status: string;
  receiptUrl?: string;
};

export default function ClaimDetailScreen() {

  const { id } = useLocalSearchParams();

  const [claim,setClaim] = useState<Claim | null>(null);
  const [loading,setLoading] = useState(true);
  const [viewerOpen,setViewerOpen] = useState(false);

  useEffect(()=>{

    if(!id) return;

    const fetchClaim = async () => {

      const ref = doc(db,"claims",id as string);
      const snap = await getDoc(ref);

      if(snap.exists()){
        setClaim(snap.data() as Claim);
      }

      setLoading(false);

    };

    fetchClaim();

  },[id]);

  const getStatusStyle=(status:string)=>{

    switch(status){
      case "approved": return styles.approved;
      case "pending": return styles.pending;
      case "rejected": return styles.rejected;
      default: return styles.pending;
    }

  };

  if(loading){
    return(
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#60A5FA"/>
      </SafeAreaView>
    );
  }

  if(!claim){
    return(
      <SafeAreaView style={styles.center}>
        <ThemedText>Claim not found</ThemedText>
      </SafeAreaView>
    );
  }

  return(

    <SafeAreaView style={styles.container}>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* HEADER */}

        <View style={styles.header}>

          <TouchableOpacity
            onPress={()=>router.back()}
            style={styles.backButton}
          >
            <IconSymbol
              name="chevron.left"
              size={26}
              color="#60A5FA"
            />
          </TouchableOpacity>

          <ThemedText type="title" style={styles.title}>
            Claim Details
          </ThemedText>

        </View>

        {/* Merchant */}

        <View style={styles.card}>
          <ThemedText style={styles.label}>Merchant</ThemedText>
          <ThemedText style={styles.value}>{claim.merchant}</ThemedText>
        </View>

        {/* Amount */}

        <View style={styles.card}>
          <ThemedText style={styles.label}>Amount</ThemedText>
          <ThemedText style={styles.value}>£{claim.amount}</ThemedText>
        </View>

        {/* Category */}

        <View style={styles.card}>
          <ThemedText style={styles.label}>Category</ThemedText>
          <ThemedText style={styles.value}>{claim.category}</ThemedText>
        </View>

        {/* Status */}

        <View style={styles.card}>

          <ThemedText style={styles.label}>
            Status
          </ThemedText>

          <View style={[styles.statusBadge,getStatusStyle(claim.status)]}>
            <ThemedText style={styles.statusText}>
              {claim.status.toUpperCase()}
            </ThemedText>
          </View>

        </View>

        {/* Receipt */}

        {claim.receiptUrl && (

          <View style={styles.receiptCard}>

            <ThemedText style={styles.label}>
              Receipt
            </ThemedText>

            <TouchableOpacity
              onPress={()=>setViewerOpen(true)}
            >
              <Image
                source={{ uri: claim.receiptUrl }}
                style={styles.receiptImage}
                resizeMode="cover"
              />
            </TouchableOpacity>

          </View>

        )}

      </ScrollView>

      {/* FULLSCREEN RECEIPT */}

      <Modal visible={viewerOpen} transparent animationType="fade">

        <View style={styles.viewerContainer}>

          <TouchableOpacity
            style={styles.closeArea}
            onPress={()=>setViewerOpen(false)}
          >

            <Image
              source={{ uri: claim.receiptUrl }}
              style={styles.viewerImage}
              resizeMode="contain"
            />

          </TouchableOpacity>

        </View>

      </Modal>

    </SafeAreaView>

  );
}

const styles = StyleSheet.create({

container:{
flex:1,
padding:20,
backgroundColor:"#0F172A"
},

header:{
flexDirection:"row",
alignItems:"center",
marginBottom:20
},

backButton:{
marginRight:10
},

title:{
color:"#F8FAFC"
},

card:{
backgroundColor:"#1E293B",
padding:16,
borderRadius:14,
marginBottom:14,
borderWidth:1,
borderColor:"#334155"
},

receiptCard:{
backgroundColor:"#1E293B",
padding:16,
borderRadius:14,
marginTop:10,
borderWidth:1,
borderColor:"#334155"
},

label:{
color:"#94A3B8",
fontSize:12,
marginBottom:6
},

value:{
color:"#F8FAFC",
fontSize:16
},

statusBadge:{
alignSelf:"flex-start",
paddingHorizontal:12,
paddingVertical:6,
borderRadius:8
},

statusText:{
color:"#FFFFFF",
fontSize:12,
fontWeight:"600"
},

approved:{backgroundColor:"#16A34A"},
pending:{backgroundColor:"#F59E0B"},
rejected:{backgroundColor:"#DC2626"},

receiptImage:{
width:"100%",
height:220,
borderRadius:12,
marginTop:10
},

viewerContainer:{
flex:1,
backgroundColor:"rgba(0,0,0,0.95)",
justifyContent:"center",
alignItems:"center"
},

closeArea:{
flex:1,
justifyContent:"center",
alignItems:"center",
width:"100%"
},

viewerImage:{
width:"100%",
height:"80%"
},

center:{
flex:1,
justifyContent:"center",
alignItems:"center",
backgroundColor:"#0F172A"
}

});