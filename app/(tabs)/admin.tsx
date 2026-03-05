import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";

import { useEffect, useState } from "react";

import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  TouchableOpacity,
  View
} from "react-native";

import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";

import { useAuth } from "../context/AuthProvider";
import { db } from "../firebase/firebaseConfig";

type Claim={
id:string;
amount:number;
merchant:string;
category:string;
userEmail:string;
receiptUrl?:string;
};

export default function AdminScreen(){

const {role}=useAuth();

const [claims,setClaims]=useState<Claim[]>([]);
const [loading,setLoading]=useState(true);

useEffect(()=>{

if(role!=="admin") return;

const q=query(
collection(db,"claims"),
where("status","==","pending"),
orderBy("createdAt","desc")
);

const unsub=onSnapshot(q,(snapshot)=>{

const data:Claim[]=snapshot.docs.map(docSnap=>({
id:docSnap.id,
...(docSnap.data() as Omit<Claim,"id">)
}));

setClaims(data);
setLoading(false);

});

return unsub;

},[role]);

const updateStatus=async(id:string,status:"approved"|"rejected")=>{

await updateDoc(doc(db,"claims",id),{
status,
statusUpdatedAt:serverTimestamp()
});

};

if(role!=="admin"){

return(
<ThemedView style={styles.container}>
<ThemedText style={styles.denied}>
Access Denied
</ThemedText>
</ThemedView>
);

}

if(loading){

return(
<View style={styles.center}>
<ActivityIndicator size="large" color="#38BDF8"/>
</View>
);

}

return(

<ThemedView style={styles.container}>

<ThemedText type="title" style={styles.title}>
Admin Panel
</ThemedText>

<FlatList
data={claims}
keyExtractor={(item)=>item.id}
renderItem={({item})=>(

<ThemedView style={styles.card}>

<ThemedText style={styles.amount}>
£{Number(item.amount).toFixed(2)}
</ThemedText>

<ThemedText style={styles.meta}>
{item.merchant} • {item.category}
</ThemedText>

<ThemedText style={styles.userEmail}>
{item.userEmail}
</ThemedText>

{item.receiptUrl &&(

<Image
source={{uri:item.receiptUrl}}
style={{
width:"100%",
height:180,
marginTop:10,
borderRadius:10
}}
resizeMode="contain"
/>

)}

<View style={styles.buttonRow}>

<TouchableOpacity
style={styles.approveBtn}
onPress={()=>updateStatus(item.id,"approved")}
>
<ThemedText style={styles.btnText}>
Approve
</ThemedText>
</TouchableOpacity>

<TouchableOpacity
style={styles.rejectBtn}
onPress={()=>updateStatus(item.id,"rejected")}
>
<ThemedText style={styles.btnText}>
Reject
</ThemedText>
</TouchableOpacity>

</View>

</ThemedView>

)}
/>

</ThemedView>

);

}

const styles=StyleSheet.create({

container:{
flex:1,
padding:20,
backgroundColor:"#0F172A"
},

title:{
marginTop:24,
fontSize:28,
fontWeight:"bold",
color:"#F8FAFC"
},

card:{
backgroundColor:"#1E293B",
padding:16,
borderRadius:14,
marginBottom:14
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

userEmail:{
marginTop:4,
color:"#64748B",
fontSize:12
},

buttonRow:{
flexDirection:"row",
marginTop:12,
gap:10
},

approveBtn:{
backgroundColor:"#16A34A",
padding:10,
borderRadius:10
},

rejectBtn:{
backgroundColor:"#DC2626",
padding:10,
borderRadius:10
},

btnText:{
color:"#fff",
fontWeight:"600"
},

center:{
flex:1,
justifyContent:"center",
alignItems:"center"
},

denied:{
marginTop:40,
color:"#EF4444",
fontSize:18
}

});