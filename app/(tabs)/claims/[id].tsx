import { router, useLocalSearchParams } from "expo-router";
import { deleteDoc, doc, getDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import {
    ActivityIndicator,
    Alert,
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
import { useTheme } from "../../../hooks/useTheme";

type Claim = {
  merchant: string;
  amount: number;
  category: string;
  status: string;
  receiptUrl?: string;
  adminFeedback?: string | null;
  approvedBy?: string | null;
  paymentStatus?: string;
};

export default function ClaimDetailScreen() {

  const { id } = useLocalSearchParams();
  const { tokens: t } = useTheme();

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

  const styles = useMemo(() => StyleSheet.create({

    container:{
      flex:1,
      padding:20,
      backgroundColor: t.bg
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
      color: t.text
    },

    card:{
      backgroundColor: t.surface,
      padding:16,
      borderRadius:14,
      marginBottom:14,
      borderWidth:1,
      borderColor: t.border
    },

    receiptCard:{
      backgroundColor: t.surface,
      padding:16,
      borderRadius:14,
      marginTop:10,
      borderWidth:1,
      borderColor: t.border
    },

    label:{
      color: t.textSecondary,
      fontSize:12,
      marginBottom:6
    },

    value:{
      color: t.text,
      fontSize:16
    },

    statusBadge:{
      alignSelf:"flex-start",
      paddingHorizontal:12,
      paddingVertical:6,
      borderRadius:8
    },

    statusText:{
      color: t.accentText,
      fontSize:12,
      fontWeight:"600"
    },

    approved:{backgroundColor: t.success},
    pending:{backgroundColor: t.warning},
    rejected:{backgroundColor: t.error},

    paymentCardPaid:{
      borderColor: t.success + "66",
      backgroundColor: t.successSurface
    },

    paymentTextPaid:{
      color: t.success,
      fontSize:14,
      fontWeight:"600"
    },

    paymentCardFailed:{
      borderColor: t.errorSurface,
      backgroundColor: t.errorSurface
    },

    paymentTextFailed:{
      color: t.error,
      fontSize:14,
      fontWeight:"600"
    },

    cancelClaimBtn:{
      borderWidth:2,
      borderColor: t.error,
      borderRadius:12,
      paddingVertical:14,
      alignItems:"center",
      marginTop:8,
      marginBottom:24
    },

    cancelClaimText:{
      color: t.error,
      fontWeight:"700",
      fontSize:15
    },

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
      backgroundColor: t.bg
    }

  }), [t]);

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
        <ActivityIndicator size="large" color={t.accent}/>
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
              color={t.accent}
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

        {/* Payment Status */}

        {claim.paymentStatus === "paid" && (
          <View style={[styles.card, styles.paymentCardPaid]}>
            <ThemedText style={styles.paymentTextPaid}>
              💳 Reimbursed — payment sent to your account
            </ThemedText>
          </View>
        )}

        {claim.paymentStatus === "failed" && (
          <View style={[styles.card, styles.paymentCardFailed]}>
            <ThemedText style={styles.paymentTextFailed}>
              ⚠️ Payment Failed — contact your admin
            </ThemedText>
          </View>
        )}

        {/* Approved / Rejected by */}

        {!!claim.approvedBy && (
          <View style={styles.card}>
            <ThemedText style={styles.label}>
              {claim.status === "approved" ? "Approved By" : "Actioned By"}
            </ThemedText>
            <ThemedText style={styles.value}>{claim.approvedBy}</ThemedText>
          </View>
        )}

        {/* Admin feedback */}

        {!!claim.adminFeedback && (
          <View style={styles.card}>
            <ThemedText style={styles.label}>Admin Message</ThemedText>
            <ThemedText style={styles.value}>{claim.adminFeedback}</ThemedText>
          </View>
        )}

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

        {/* Cancel Claim */}

        {claim.status === "pending" && (
          <TouchableOpacity
            style={styles.cancelClaimBtn}
            onPress={() => {
              Alert.alert(
                "Cancel Claim",
                "Are you sure you want to cancel this claim? This cannot be undone.",
                [
                  { text: "No", style: "cancel" },
                  {
                    text: "Yes, Cancel",
                    style: "destructive",
                    onPress: async () => {
                      await deleteDoc(doc(db, "claims", id as string));
                      router.back();
                    }
                  }
                ]
              );
            }}
          >
            <ThemedText style={styles.cancelClaimText}>Cancel Claim</ThemedText>
          </TouchableOpacity>
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
