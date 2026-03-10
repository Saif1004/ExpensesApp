import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

import {
  createUserWithEmailAndPassword,
  updateProfile
} from "firebase/auth";

import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where
} from "firebase/firestore";

import { useState } from "react";
import {
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import tw from "twrnc";
import { auth, db } from "./firebase/firebaseConfig";

export default function SignUp(){

const router = useRouter();

const [username,setUsername] = useState("");
const [email,setEmail] = useState("");
const [password,setPassword] = useState("");
const [confirmPassword,setConfirmPassword] = useState("");
const [role,setRole] = useState("employee");
const [organisation,setOrganisation] = useState("");

//////////////////////////////////////////////////////
// USERNAME EXISTS
//////////////////////////////////////////////////////

const usernameExists = async(username:string)=>{

const q=query(
collection(db,"usernames"),
where("__name__","==",username)
);

const snap=await getDocs(q);
return !snap.empty;

};

//////////////////////////////////////////////////////
// SIGN UP
//////////////////////////////////////////////////////

const handleSignUp=async()=>{

try{

const trimmedUsername=username.trim();
const normalizedUsername=trimmedUsername.toLowerCase();
const trimmedEmail=email.trim();

if(!trimmedUsername||!trimmedEmail||!password||!confirmPassword){
Alert.alert("Missing details");
return;
}

if(password!==confirmPassword){
Alert.alert("Passwords do not match");
return;
}

if(await usernameExists(normalizedUsername)){
Alert.alert("Username taken");
return;
}

////////////////////////////////////////////////////
//// CREATE AUTH USER
////////////////////////////////////////////////////

const cred=await createUserWithEmailAndPassword(
auth,
trimmedEmail,
password
);

const uid=cred.user.uid;

await updateProfile(cred.user,{
displayName:trimmedUsername
});

////////////////////////////////////////////////////
//// CREATE USER PROFILE
////////////////////////////////////////////////////

await setDoc(doc(db,"users",uid),{
uid,
email:trimmedEmail,
username:normalizedUsername,
displayName:trimmedUsername,
createdAt:serverTimestamp()
});

////////////////////////////////////////////////////
//// USERNAME LOOKUP
////////////////////////////////////////////////////

await setDoc(doc(db,"usernames",normalizedUsername),{
uid
});

////////////////////////////////////////////////////
//// ADMIN CREATES ORGANISATION
////////////////////////////////////////////////////

if(role==="admin"){

if(!organisation){
Alert.alert("Enter organisation name");
return;
}

const orgRef=doc(collection(db,"organisations"));

await setDoc(orgRef,{
name:organisation,
ownerId:uid,
createdAt:serverTimestamp()
});

await setDoc(doc(collection(db,"memberships")),{
userId:uid,
orgId:orgRef.id,
role:"admin",
status:"approved",
createdAt:serverTimestamp()
});

}

////////////////////////////////////////////////////
//// EMPLOYEE REQUEST
////////////////////////////////////////////////////

if(role==="employee"){

const q=query(
collection(db,"organisations"),
where("name","==",organisation)
);

const snap=await getDocs(q);

if(snap.empty){
Alert.alert("Organisation not found");
return;
}

const orgId=snap.docs[0].id;

await setDoc(doc(collection(db,"memberships")),{
userId:uid,
orgId,
role:"employee",
status:"pending",
createdAt:serverTimestamp()
});

}

Alert.alert("Account created");

router.replace("/sign-in");

}catch(err){

console.log("SIGNUP ERROR:",err);
Alert.alert("Signup failed");

}

};

//////////////////////////////////////////////////////
// UI
//////////////////////////////////////////////////////

return(

<LinearGradient colors={["#020617","#0F172A"]} style={{flex:1}}>

<View style={{flex:1,paddingHorizontal:24,justifyContent:"center"}}>

<View style={{
borderRadius:24,
padding:20,
backgroundColor:"rgba(31,41,55,0.9)"
}}>

<Text style={tw`text-slate-100 text-2xl font-bold mb-4`}>
Create Account
</Text>

<View style={tw`flex-row mb-4`}>

<TouchableOpacity
style={[
tw`flex-1 py-2 rounded-l-full items-center`,
role==="employee"?tw`bg-blue-500`:tw`bg-slate-700`
]}
onPress={()=>setRole("employee")}
>
<Text style={tw`text-white text-xs font-semibold`}>
Employee
</Text>
</TouchableOpacity>

<TouchableOpacity
style={[
tw`flex-1 py-2 rounded-r-full items-center`,
role==="admin"?tw`bg-blue-500`:tw`bg-slate-700`
]}
onPress={()=>setRole("admin")}
>
<Text style={tw`text-white text-xs font-semibold`}>
Admin
</Text>
</TouchableOpacity>

</View>

<TextInput
value={organisation}
onChangeText={setOrganisation}
placeholder="Organisation Name"
placeholderTextColor="#64748B"
style={tw`border border-slate-700 text-white p-3 rounded-full mb-4`}
/>

<TextInput
value={username}
onChangeText={setUsername}
placeholder="Username"
placeholderTextColor="#64748B"
style={tw`border border-slate-700 text-white p-3 rounded-full mb-4`}
/>

<TextInput
value={email}
onChangeText={setEmail}
placeholder="Email"
placeholderTextColor="#64748B"
style={tw`border border-slate-700 text-white p-3 rounded-full mb-4`}
/>

<TextInput
value={password}
onChangeText={setPassword}
placeholder="Password"
secureTextEntry
placeholderTextColor="#64748B"
style={tw`border border-slate-700 text-white p-3 rounded-full mb-4`}
/>

<TextInput
value={confirmPassword}
onChangeText={setConfirmPassword}
placeholder="Confirm Password"
secureTextEntry
placeholderTextColor="#64748B"
style={tw`border border-slate-700 text-white p-3 rounded-full mb-6`}
/>

<TouchableOpacity
style={tw`bg-blue-500 p-3 rounded-full items-center`}
onPress={handleSignUp}
>
<Text style={tw`text-white font-semibold`}>
Create Account
</Text>
</TouchableOpacity>

<TouchableOpacity
onPress={()=>router.push("/sign-in")}
>
<Text style={tw`text-slate-400 text-center text-xs mt-3`}>
Already have an account? Sign In
</Text>
</TouchableOpacity>

</View>
</View>
</LinearGradient>

);

}