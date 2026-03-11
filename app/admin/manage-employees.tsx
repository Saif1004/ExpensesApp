import { useEffect, useState } from "react";
import {
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";

import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    updateDoc
} from "firebase/firestore";

import { db } from "../firebase/firebaseConfig";

export default function ManageEmployees(){

const [users,setUsers]=useState([]);

const loadUsers = async()=>{

const snap = await getDocs(collection(db,"memberships"));

const list:any[]=[];

snap.forEach(doc=>{
list.push({id:doc.id,...doc.data()});
});

setUsers(list);

};

useEffect(()=>{
loadUsers();
},[]);

const toggleRole = async(user:any)=>{

const newRole = user.role === "admin" ? "employee" : "admin";

await updateDoc(doc(db,"memberships",user.id),{
role:newRole
});

loadUsers();

};

const removeUser = async(id:string)=>{

await deleteDoc(doc(db,"memberships",id));
loadUsers();

};

return(

<View style={styles.container}>

<Text style={styles.title}>
Employees
</Text>

<FlatList
data={users}
keyExtractor={(item:any)=>item.id}
renderItem={({item}:any)=>(

<View style={styles.card}>

<Text style={styles.text}>
{item.userId}
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

);

}

const styles = StyleSheet.create({

container:{flex:1,padding:20,backgroundColor:"#0F172A"},
title:{fontSize:26,color:"#FFF",marginBottom:20},

card:{
backgroundColor:"#1E293B",
padding:16,
borderRadius:10,
marginBottom:10
},

text:{color:"#FFF",marginBottom:10},

buttons:{flexDirection:"row",gap:10},

roleBtn:{backgroundColor:"#2563EB",padding:10,borderRadius:8},
removeBtn:{backgroundColor:"#DC2626",padding:10,borderRadius:8},

btnText:{color:"#FFF"}

});