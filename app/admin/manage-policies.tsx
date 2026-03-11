import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    query,
    where
} from "firebase/firestore";

import { useRouter } from "expo-router";
import { useAuth } from "../context/AuthProvider";
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
  const { role, authLoaded } = useAuth();

  const [policies,setPolicies] = useState<Policy[]>([]);
  const [title,setTitle] = useState("");
  const [loading,setLoading] = useState(true);
  const [creating,setCreating] = useState(false);
  const [orgId,setOrgId] = useState<string | null>(null);

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

    const res = await fetch(AI_POLICY_URL,{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        text:title.trim(),
        orgId
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
// LOADING
//////////////////////////////////////////////////////

if(loading){
  return(
    <SafeAreaView style={styles.loading}>
      <ActivityIndicator size="large" color="#3B82F6"/>
    </SafeAreaView>
  );
}

//////////////////////////////////////////////////////
// UI
//////////////////////////////////////////////////////

return(

<SafeAreaView style={styles.safe}>

<View style={styles.container}>

<View style={styles.header}>

<TouchableOpacity onPress={()=>router.back()}>
<Text style={styles.back}>← Back</Text>
</TouchableOpacity>

<Text style={styles.title}>Manage Policies</Text>

<View style={{width:60}}/>

</View>

<TextInput
placeholder="Enter Here"
placeholderTextColor="#94A3B8"
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

{policies.length === 0 ? (

<Text style={styles.empty}>
No policies created yet.
</Text>

):(

<FlatList
data={policies}
keyExtractor={(item)=>item.id}
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

</View>

</SafeAreaView>

);

}

//////////////////////////////////////////////////////
// STYLES
//////////////////////////////////////////////////////

const styles = StyleSheet.create({

safe:{flex:1,backgroundColor:"#0F172A"},
container:{flex:1,padding:20},

header:{
flexDirection:"row",
alignItems:"center",
justifyContent:"space-between",
marginBottom:20
},

back:{color:"#38BDF8",fontSize:16,width:60},

title:{
fontSize:24,
color:"#FFF",
fontWeight:"600",
textAlign:"center",
flex:1
},

input:{
backgroundColor:"#1E293B",
padding:12,
color:"#FFF",
borderRadius:8
},

addBtn:{
backgroundColor:"#2563EB",
padding:12,
marginTop:10,
borderRadius:8
},

btnText:{color:"#FFF",textAlign:"center"},

policyCard:{
flexDirection:"row",
justifyContent:"space-between",
padding:14,
backgroundColor:"#1E293B",
marginTop:10,
borderRadius:10
},

policyText:{color:"#FFF",flex:1,paddingRight:10},

remove:{color:"#EF4444",fontWeight:"600"},

empty:{
color:"#94A3B8",
marginTop:20,
textAlign:"center"
},

loading:{
flex:1,
justifyContent:"center",
alignItems:"center",
backgroundColor:"#0F172A"
}

});