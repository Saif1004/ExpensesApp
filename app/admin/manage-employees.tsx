import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    Text,
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
    updateDoc,
    where
} from "firebase/firestore";

import { useRouter } from "expo-router";

import { useAuth } from "../context/AuthProvider";
import { db } from "../firebase/firebaseConfig";

export default function ManageEmployees(){

const router = useRouter();
const { role, authLoaded, orgId, user } = useAuth();

const [users,setUsers] = useState<any[]>([]);
const [loading,setLoading] = useState(true);

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
// LOAD USERS FROM SAME ORGANISATION
//////////////////////////////////////////////////////

const loadUsers = async()=>{

try{

setLoading(true);

if(!user?.emailVerified || !orgId){
  setUsers([]);
  setLoading(false);
  return;
}

const q = query(
  collection(db,"memberships"),
  where("orgId","==",orgId)
);

const snap = await getDocs(q);

// displayName, email, username stored on the membership doc at sign-up
// — no cross-user getDoc(users/{uid}) needed (owner-only rule would deny it)
const list = snap.docs.map(docSnap => {
  const m = docSnap.data();
  return {
    id:          docSnap.id,
    userId:      m.userId,
    role:        m.role,
    status:      m.status,
    displayName: m.displayName,
    email:       m.email,
    username:    m.username ?? m.displayName,
  };
});

setUsers(list);

}catch(err){

console.log("Load users error:",err);

}finally{

setLoading(false);

}

};

useEffect(()=>{
loadUsers();
},[orgId, user]);

//////////////////////////////////////////////////////
// TOGGLE ROLE
//////////////////////////////////////////////////////

const toggleRole = async(user:any)=>{

const newRole =
user.role === "admin"
? "employee"
: "admin";

await updateDoc(doc(db,"memberships",user.id),{
role:newRole
});

loadUsers();

};

//////////////////////////////////////////////////////
// REMOVE USER
//////////////////////////////////////////////////////

const removeUser = async(id:string)=>{

await deleteDoc(doc(db,"memberships",id));

loadUsers();

};

//////////////////////////////////////////////////////
// UI
//////////////////////////////////////////////////////

if(loading){
return(
<SafeAreaView style={styles.loading}>
<ActivityIndicator size="large" color="#3B82F6"/>
</SafeAreaView>
);
}

return(

<SafeAreaView style={styles.safe}>

<View style={styles.container}>

<View style={styles.header}>

<TouchableOpacity onPress={()=>router.back()}>
<Text style={styles.back}>← Back</Text>
</TouchableOpacity>

<Text style={styles.title}>
Manage Employees
</Text>

<View style={{width:60}}/>

</View>

<FlatList
data={users}
keyExtractor={(item:any)=>item.id}
renderItem={({item}:any)=>(

<View style={styles.card}>

<Text style={styles.name}>
{item.displayName || item.username || "Unknown User"}
</Text>

<Text style={styles.email}>
{item.email || "No email"}
</Text>

<Text style={styles.role}>
Role: {item.role}
</Text>

<View style={styles.buttons}>

<TouchableOpacity
style={styles.roleBtn}
onPress={()=>toggleRole(item)}
>
<Text style={styles.btnText}>
Toggle Role
</Text>
</TouchableOpacity>

<TouchableOpacity
style={styles.removeBtn}
onPress={()=>removeUser(item.id)}
>
<Text style={styles.btnText}>
Remove
</Text>
</TouchableOpacity>

</View>

</View>

)}
/>

</View>

</SafeAreaView>

);

}

const styles = StyleSheet.create({

safe:{
flex:1,
backgroundColor:"#0F172A"
},

container:{
flex:1,
padding:20
},

header:{
flexDirection:"row",
alignItems:"center",
justifyContent:"space-between",
marginBottom:20
},

back:{
color:"#38BDF8",
fontSize:16,
width:60
},

title:{
fontSize:24,
color:"#FFF",
fontWeight:"600",
textAlign:"center",
flex:1
},

card:{
backgroundColor:"#1E293B",
padding:16,
borderRadius:10,
marginBottom:12
},

name:{
color:"#FFF",
fontSize:16,
fontWeight:"600"
},

email:{
color:"#94A3B8",
marginTop:4
},

role:{
color:"#38BDF8",
marginTop:6,
fontSize:12
},

buttons:{
flexDirection:"row",
gap:10,
marginTop:10
},

roleBtn:{
backgroundColor:"#2563EB",
padding:10,
borderRadius:8
},

removeBtn:{
backgroundColor:"#DC2626",
padding:10,
borderRadius:8
},

btnText:{
color:"#FFF"
},

loading:{
flex:1,
justifyContent:"center",
alignItems:"center",
backgroundColor:"#0F172A"
}

});