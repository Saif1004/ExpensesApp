import { useEffect, useState } from "react";
import {
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";

import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs
} from "firebase/firestore";

import { db } from "../firebase/firebaseConfig";

export default function ManagePolicies(){

const [policies,setPolicies] = useState([]);
const [title,setTitle] = useState("");

const loadPolicies = async()=>{

const snap = await getDocs(collection(db,"policies"));

const list:any[]=[];

snap.forEach(doc=>{
list.push({id:doc.id,...doc.data()});
});

setPolicies(list);

};

useEffect(()=>{
loadPolicies();
},[]);

const addPolicy = async()=>{

if(!title) return;

await addDoc(collection(db,"policies"),{
title
});

setTitle("");
loadPolicies();

};

const removePolicy = async(id:string)=>{

await deleteDoc(doc(db,"policies",id));
loadPolicies();

};

return(

<View style={styles.container}>

<Text style={styles.title}>Policies</Text>

<TextInput
placeholder="New policy"
value={title}
onChangeText={setTitle}
style={styles.input}
/>

<TouchableOpacity
style={styles.addBtn}
onPress={addPolicy}
>
<Text style={styles.btnText}>Add Policy</Text>
</TouchableOpacity>

<FlatList
data={policies}
keyExtractor={(item:any)=>item.id}
renderItem={({item}:any)=>(
<View style={styles.policyCard}>

<Text style={styles.policyText}>
{item.title}
</Text>

<TouchableOpacity
onPress={()=>removePolicy(item.id)}
>
<Text style={styles.remove}>Remove</Text>
</TouchableOpacity>

</View>
)}
/>

</View>

);

}

const styles = StyleSheet.create({
container:{flex:1,padding:20,backgroundColor:"#0F172A"},
title:{fontSize:26,color:"#FFF",marginBottom:20},
input:{backgroundColor:"#1E293B",padding:12,color:"#FFF",borderRadius:8},
addBtn:{backgroundColor:"#2563EB",padding:12,marginTop:10,borderRadius:8},
btnText:{color:"#FFF",textAlign:"center"},
policyCard:{flexDirection:"row",justifyContent:"space-between",padding:14,backgroundColor:"#1E293B",marginTop:10,borderRadius:10},
policyText:{color:"#FFF"},
remove:{color:"#EF4444"}
});