import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where
} from "firebase/firestore";

import { useRouter } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { useAuth } from "../context/AuthProvider";
import { ThemedText } from "../../components/themed-text";
import { auth, db } from "../firebase/firebaseConfig";

//////////////////////////////////////////////////////
// CONFIG
//////////////////////////////////////////////////////

const AI_POLICY_URL = process.env.EXPO_PUBLIC_AI_POLICY_URL!;

//////////////////////////////////////////////////////
// TYPES
//////////////////////////////////////////////////////

type Policy = {
  id: string;
  type?: string;
  value?: number;
  category?: string | null;
  orgId: string;
  displayText?: string;
  originalText?: string;
};

//////////////////////////////////////////////////////
// COMPONENT
//////////////////////////////////////////////////////

export default function ManagePolicies(){

  const router = useRouter();
  const { role, authLoaded, isBusiness } = useAuth();
  const { tokens: t } = useTheme();

  const [policies,setPolicies] = useState<Policy[]>([]);
  const [title,setTitle] = useState("");
  const [loading,setLoading] = useState(true);
  const [creating,setCreating] = useState(false);
  const [orgId,setOrgId] = useState<string | null>(null);

  // two-level approval state
  const [thresholdInput,  setThresholdInput]  = useState("");
  const [savingThreshold, setSavingThreshold] = useState(false);

//////////////////////////////////////////////////////
// ADMIN PROTECTION
//////////////////////////////////////////////////////

useEffect(()=>{

  if(!authLoaded) return;

  if(role !== "admin"){
    router.replace("/(tabs)/home");
  }

},[role,authLoaded]);

//////////////////////////////////////////////////////
// LOAD POLICIES
//////////////////////////////////////////////////////

const loadPolicies = async()=>{

  try{

    setLoading(true);

    const user = auth.currentUser;
    if(!user) return;

    const membershipQuery = query(
      collection(db,"memberships"),
      where("userId","==",user.uid)
    );

    const membershipSnap = await getDocs(membershipQuery);

    if(membershipSnap.empty) return;

    const org = membershipSnap.docs[0].data().orgId;

    setOrgId(org);

    const policyQuery = query(
      collection(db,"policies"),
      where("orgId","==",org)
    );

    const snap = await getDocs(policyQuery);

    const list: Policy[] = [];

    snap.forEach(docSnap => {

      const data = docSnap.data();

      list.push({
        id: docSnap.id,
        type: data.type,
        value: data.value,
        category: data.category,
        orgId: data.orgId,
        displayText: data.displayText,
        originalText: data.originalText
      });

    });

    setPolicies(list);

  }catch(err){

    console.log("Load policies error:",err);

  }finally{

    setLoading(false);

  }

};

useEffect(()=>{
  loadPolicies();
},[]);

//////////////////////////////////////////////////////
// ADD POLICY
//////////////////////////////////////////////////////

const addPolicy = async()=>{

  if(!title.trim() || !orgId) return;

  try{

    setCreating(true);

    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken(true);

    const res = await fetch(AI_POLICY_URL,{
      method:"POST",
      headers:{
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        text:  title.trim(),
        orgId,
        userId: user.uid,
      })
    });

    const data = await res.json();

    if(!res.ok){
      Alert.alert("AI Error",data?.error || "Policy parsing failed");
      return;
    }

    setTitle("");
    await loadPolicies();

  }catch(err){

    console.log("AI policy error:",err);
    Alert.alert("Error","Could not create policy.");

  }finally{

    setCreating(false);

  }

};

//////////////////////////////////////////////////////
// REMOVE POLICY
//////////////////////////////////////////////////////

const confirmDelete = (id:string)=>{

  Alert.alert(
    "Remove Policy",
    "Are you sure you want to delete this policy?",
    [
      {text:"Cancel",style:"cancel"},
      {
        text:"Delete",
        style:"destructive",
        onPress:()=>removePolicy(id)
      }
    ]
  );

};

const removePolicy = async(id:string)=>{

  try{

    await deleteDoc(doc(db,"policies",id));

    setPolicies(prev => prev.filter(p => p.id !== id));

  }catch(err){

    console.log("Delete policy error:",err);

    Alert.alert(
      "Delete failed",
      "You may not have permission."
    );

  }

};

//////////////////////////////////////////////////////
// TWO-LEVEL APPROVAL THRESHOLD
//////////////////////////////////////////////////////

// finds the existing approval_required_above policy if any
const approvalPolicy = policies.find(p => p.type === "approval_required_above") ?? null;

const enableApprovalThreshold = async () => {
  const parsed = parseFloat(thresholdInput.replace(/[^0-9.]/g, ""));
  if (!parsed || parsed <= 0) {
    Alert.alert("Invalid amount", "Enter a valid threshold amount.");
    return;
  }
  if (!isBusiness) {
    Alert.alert("Business Plan Required", "Upgrade to Business to use multi-level approvals.");
    return;
  }
  if (!orgId) return;
  setSavingThreshold(true);
  try {
    await addDoc(collection(db, "policies"), {
      orgId,
      type: "approval_required_above",
      value: parsed,
      displayText: `Claims over £${parsed} require a second approval`,
      createdAt: serverTimestamp(),
    });
    setThresholdInput("");
    await loadPolicies();
  } catch {
    Alert.alert("Error", "Could not save the approval threshold.");
  } finally {
    setSavingThreshold(false);
  }
};

const disableApprovalThreshold = async () => {
  if (!approvalPolicy) return;
  setSavingThreshold(true);
  try {
    await deleteDoc(doc(db, "policies", approvalPolicy.id));
    setPolicies(prev => prev.filter(p => p.id !== approvalPolicy.id));
  } catch {
    Alert.alert("Error", "Could not remove the threshold.");
  } finally {
    setSavingThreshold(false);
  }
};

//////////////////////////////////////////////////////
// POLICY DISPLAY
//////////////////////////////////////////////////////

const formatPolicy = (policy:Policy)=>{

  if(policy.displayText){
    return policy.displayText;
  }

  if(policy.originalText){
    return policy.originalText;
  }

  if(policy.type === "receipt_required"){
    return `📄 Receipt required above £${policy.value}`;
  }

  if(policy.type === "category_limit"){
    return `💰 ${policy.category} limit £${policy.value}`;
  }

  if(policy.type === "submission_window"){
    return `📅 Claims must be submitted within ${policy.value} days`;
  }

  return "Company expense policy";

};

//////////////////////////////////////////////////////
// STYLES
//////////////////////////////////////////////////////

const styles = useMemo(() => StyleSheet.create({

  safe:{flex:1,backgroundColor: t.bg},
  container:{flex:1,padding:20},

  header:{
    flexDirection:"row",
    alignItems:"center",
    justifyContent:"space-between",
    marginBottom:20
  },

  back:{color: t.textSecondary,fontSize:16,width:60},

  title:{
    fontSize:24,
    color: t.text,
    fontWeight:"800",
    letterSpacing: -0.5,
    textAlign:"center",
    flex:1
  },

  input:{
    backgroundColor: t.surface,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: t.text,
    borderRadius:999
  },

  addBtn:{
    backgroundColor: t.accent,
    padding:14,
    marginTop:10,
    borderRadius:999
  },

  btnText:{color: "#FFFFFF", textAlign:"center", fontWeight: "700"},

  policyCard:{
    flexDirection:"row",
    justifyContent:"space-between",
    padding:16,
    backgroundColor: t.surface,
    marginTop:10,
    borderRadius:16
  },

  policyText:{color: t.text, flex:1, paddingRight:10},

  remove:{color: t.error, fontWeight:"600"},

  empty:{
    color: t.textSecondary,
    marginTop:20,
    textAlign:"center"
  },

  loading:{
    flex:1,
    justifyContent:"center",
    alignItems:"center",
    backgroundColor: t.bg
  },

  // two-level approval card
  approvalCard:{
    backgroundColor: t.surface,
    borderRadius:16,
    padding:16,
    marginBottom:16,
  },
  approvalCardTitle:{
    color: t.text,
    fontSize:15,
    fontWeight:"700",
    marginBottom:4,
  },
  approvalCardSub:{
    color: t.textSecondary,
    fontSize:12,
    marginBottom:12,
  },
  approvalActive:{
    color: t.text,
    fontSize:13,
    fontWeight:"600",
    marginBottom:12,
  },
  approvalRow:{
    flexDirection:"row",
    gap:10,
    alignItems:"center",
  },
  approvalInput:{
    flex:1,
    backgroundColor: t.surfaceAlt,
    paddingHorizontal:16,
    paddingVertical:11,
    color: t.text,
    borderRadius:999,
    fontSize:14,
  },
  enableBtn:{
    backgroundColor: t.accent,
    paddingHorizontal:18,
    paddingVertical:11,
    borderRadius:999,
  },
  enableBtnText:{color:"#FFFFFF",fontWeight:"700",fontSize:13},
  disableBtn:{
    backgroundColor: t.errorSurface,
    paddingHorizontal:18,
    paddingVertical:11,
    borderRadius:999,
  },
  disableBtnText:{color: t.error,fontWeight:"700",fontSize:13},
  lockRow:{
    flexDirection:"row",
    alignItems:"center",
    gap:6,
  },
  lockText:{color: t.textSecondary,fontSize:12},
  upgradeRow:{
    flexDirection:"row",
    alignItems:"center",
    gap:6,
    marginTop:10,
    backgroundColor:"#7C3AED" + "18",
    borderRadius:10,
    paddingHorizontal:12,
    paddingVertical:10,
  },
  upgradeRowText:{color:"#A78BFA",fontSize:12,fontWeight:"600",flex:1},
  upgradeRowCta:{color:"#7C3AED",fontSize:12,fontWeight:"700"},

}), [t]);

//////////////////////////////////////////////////////
// LOADING
//////////////////////////////////////////////////////

if(loading){
  return(
    <SafeAreaView style={styles.loading}>
      <ActivityIndicator size="large" color={t.accent}/>
    </SafeAreaView>
  );
}

//////////////////////////////////////////////////////
// UI
//////////////////////////////////////////////////////

// filter out the approval_required_above policy from the general list
const aiPolicies = policies.filter(p => p.type !== "approval_required_above");

return(

<SafeAreaView style={styles.safe}>

<ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

<View style={styles.header}>

<TouchableOpacity onPress={()=>router.back()}>
<Text style={styles.back}>← Back</Text>
</TouchableOpacity>

<Text style={styles.title}>Manage Policies</Text>

<View style={{width:60}}/>

</View>

{/* two-level approval threshold card — shown at top */}
<View style={styles.approvalCard}>
  <ThemedText style={styles.approvalCardTitle}>Two-Level Approval</ThemedText>
  <ThemedText style={styles.approvalCardSub}>
    Claims above this amount require a second admin sign-off before payment is triggered.
  </ThemedText>
  {!isBusiness ? (
    <TouchableOpacity style={styles.upgradeRow} onPress={() => router.push("/plans")} activeOpacity={0.8}>
      <Ionicons name="lock-closed" size={14} color="#7C3AED" />
      <ThemedText style={styles.upgradeRowText}>Business plan required</ThemedText>
      <ThemedText style={styles.upgradeRowCta}>Upgrade →</ThemedText>
    </TouchableOpacity>
  ) : approvalPolicy ? (
    <>
      <ThemedText style={styles.approvalActive}>
        Claims over £{approvalPolicy.value} require second approval
      </ThemedText>
      <TouchableOpacity
        style={styles.disableBtn}
        onPress={disableApprovalThreshold}
        disabled={savingThreshold}
        activeOpacity={0.8}
      >
        {savingThreshold
          ? <ActivityIndicator color={t.error} size="small" />
          : <ThemedText style={styles.disableBtnText}>Disable</ThemedText>
        }
      </TouchableOpacity>
    </>
  ) : (
    <View style={styles.approvalRow}>
      <TextInput
        style={styles.approvalInput}
        placeholder="Threshold amount (£)"
        placeholderTextColor={t.textSecondary}
        value={thresholdInput}
        onChangeText={setThresholdInput}
        keyboardType="decimal-pad"
        returnKeyType="done"
      />
      <TouchableOpacity
        style={styles.enableBtn}
        onPress={enableApprovalThreshold}
        disabled={savingThreshold || !thresholdInput.trim()}
        activeOpacity={0.8}
      >
        {savingThreshold
          ? <ActivityIndicator color="#FFFFFF" size="small" />
          : <ThemedText style={styles.enableBtnText}>Enable</ThemedText>
        }
      </TouchableOpacity>
    </View>
  )}
</View>

<TextInput
placeholder="Enter Here"
placeholderTextColor={t.textSecondary}
value={title}
onChangeText={setTitle}
style={styles.input}
/>

<TouchableOpacity
style={styles.addBtn}
onPress={addPolicy}
disabled={creating}
>

<Text style={styles.btnText}>
{creating ? "Creating..." : "Add Policy"}
</Text>

</TouchableOpacity>

{aiPolicies.length === 0 ? (

<Text style={styles.empty}>
No AI policies created yet.
</Text>

):(

<FlatList
data={aiPolicies}
keyExtractor={(item)=>item.id}
scrollEnabled={false}
renderItem={({item,index})=>(

<View style={styles.policyCard}>

<Text style={styles.policyText}>
{index+1}. {formatPolicy(item)}
</Text>

<TouchableOpacity
onPress={()=>confirmDelete(item.id)}
>
<Text style={styles.remove}>Remove</Text>
</TouchableOpacity>

</View>

)}
/>

)}

<View style={{height:40}}/>

</ScrollView>

</SafeAreaView>

);

}
