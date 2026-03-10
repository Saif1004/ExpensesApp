import { collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";

import { db } from "../firebase/firebaseConfig";

export default function AdminUsers(){

const [users,setUsers] = useState<any[]>([]);
const [loading,setLoading] = useState(true);

//////////////////////////////////////////////////////
// LOAD USERS
//////////////////////////////////////////////////////

const loadUsers = async () => {

 setLoading(true);

 const q = query(
   collection(db,"users"),
   where("status","==","pending")
 );

 const snap = await getDocs(q);

 const list = snap.docs.map(d => ({
   id:d.id,
   ...d.data()
 }));

 setUsers(list);
 setLoading(false);

};

useEffect(()=>{
 loadUsers();
},[]);

//////////////////////////////////////////////////////
// APPROVE USER
//////////////////////////////////////////////////////

const approveUser = async (uid:string) => {

 await updateDoc(doc(db,"users",uid),{
   status:"approved"
 });

 loadUsers();

};

//////////////////////////////////////////////////////
// REJECT USER
//////////////////////////////////////////////////////

const rejectUser = async (uid:string) => {

 await updateDoc(doc(db,"users",uid),{
   status:"rejected"
 });

 loadUsers();

};

//////////////////////////////////////////////////////
// UI
//////////////////////////////////////////////////////

return(

<View style={styles.container}>

<Text style={styles.title}>
Pending User Approvals
</Text>

{loading ? (

<ActivityIndicator color="#3B82F6" size="large"/>

) : (

<ScrollView>

{users.length === 0 && (

<Text style={styles.empty}>
No pending users
</Text>

)}

{users.map((user:any)=>(

<View key={user.id} style={styles.card}>

<View style={styles.userInfo}>

<Text style={styles.name}>
{user.displayName}
</Text>

<Text style={styles.email}>
{user.email}
</Text>

<Text style={styles.role}>
Role: {user.role}
</Text>

</View>

<View style={styles.buttons}>

<TouchableOpacity
style={styles.approve}
onPress={()=>approveUser(user.uid)}
>
<Text style={styles.approveText}>
Approve
</Text>
</TouchableOpacity>

<TouchableOpacity
style={styles.reject}
onPress={()=>rejectUser(user.uid)}
>
<Text style={styles.rejectText}>
Reject
</Text>
</TouchableOpacity>

</View>

</View>

))}

</ScrollView>

)}

</View>

);

}

//////////////////////////////////////////////////////
// STYLES
//////////////////////////////////////////////////////

const styles = StyleSheet.create({

container:{
flex:1,
backgroundColor:"#0F172A",
padding:20
},

title:{
color:"#F8FAFC",
fontSize:26,
fontWeight:"bold",
marginBottom:20
},

card:{
backgroundColor:"#1E293B",
borderRadius:14,
padding:16,
marginBottom:14
},

userInfo:{
marginBottom:10
},

name:{
color:"#F8FAFC",
fontSize:16,
fontWeight:"600"
},

email:{
color:"#94A3B8",
marginTop:2
},

role:{
color:"#64748B",
fontSize:12,
marginTop:4
},

buttons:{
flexDirection:"row",
gap:10
},

approve:{
flex:1,
backgroundColor:"#2563EB",
paddingVertical:10,
borderRadius:10,
alignItems:"center"
},

approveText:{
color:"#FFFFFF",
fontWeight:"600"
},

reject:{
flex:1,
backgroundColor:"#DC2626",
paddingVertical:10,
borderRadius:10,
alignItems:"center"
},

rejectText:{
color:"#FFFFFF",
fontWeight:"600"
},

empty:{
color:"#64748B",
textAlign:"center",
marginTop:40
}

});