import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  createUserWithEmailAndPassword,
  updateProfile
} from "firebase/auth";

import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc
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

const ADMIN_INVITE_CODE="7421";

export default function SignUp(){

const router=useRouter();

const [username,setUsername]=useState("");
const [email,setEmail]=useState("");
const [password,setPassword]=useState("");
const [confirmPassword,setConfirmPassword]=useState("");
const [role,setRole]=useState("employee");
const [inviteCode,setInviteCode]=useState("");

const usernameExists=async(username)=>{
const ref=doc(db,"usernames",username);
const snap=await getDoc(ref);
return snap.exists();
};

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

const exists=await usernameExists(normalizedUsername);

if(exists){
Alert.alert("Username taken");
return;
}

let orgId=null;

////////////////////////////////////////////////////
//// VALIDATE ROLE
////////////////////////////////////////////////////

if(role==="admin"){

if(inviteCode!==ADMIN_INVITE_CODE){
Alert.alert("Invalid admin invite code");
return;
}

}

////////////////////////////////////////////////////
//// EMPLOYEE INVITE
////////////////////////////////////////////////////

if(role==="employee"){

const inviteRef=doc(db,"inviteCodes",inviteCode);
const inviteSnap=await getDoc(inviteRef);

if(!inviteSnap.exists()){
Alert.alert("Invalid invite code");
return;
}

orgId=inviteSnap.data().orgId;

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
//// USERS COLLECTION
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
//// ADMIN CREATES ORG
////////////////////////////////////////////////////

if(role==="admin"){

const orgRef=doc(collection(db,"organisations"));

await setDoc(orgRef,{
name:`${trimmedUsername}'s Organisation`,
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
//// EMPLOYEE JOINS
////////////////////////////////////////////////////

if(role==="employee"){

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

return(
<LinearGradient colors={["#020617","#0F172A"]} style={{flex:1}}>
<View style={{flex:1,paddingHorizontal:24,justifyContent:"center"}}>
<View style={{
borderRadius:24,
padding:20,
backgroundColor:"rgba(31,41,55,0.9)"
}}>

<Text style={tw`text-slate-100 text-2xl font-bold mb-2`}>
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
<Text style={tw`text-white text-xs font-semibold`}>Employee</Text>
</TouchableOpacity>

<TouchableOpacity
style={[
tw`flex-1 py-2 rounded-r-full items-center`,
role==="admin"?tw`bg-blue-500`:tw`bg-slate-700`
]}
onPress={()=>setRole("admin")}
>
<Text style={tw`text-white text-xs font-semibold`}>Admin</Text>
</TouchableOpacity>

</View>

<TextInput
value={inviteCode}
onChangeText={setInviteCode}
placeholder="Invite Code"
placeholderTextColor="#64748B"
style={tw`border border-slate-700 text-white p-3 rounded-full mb-4`}
/>

<TextInput
value={username}
onChangeText={setUsername}
placeholder="Username"
placeholderTextColor="#64748B"
autoCapitalize="none"
style={tw`border border-slate-700 text-white p-3 rounded-full mb-4`}
/>

<TextInput
value={email}
onChangeText={setEmail}
placeholder="Email"
placeholderTextColor="#64748B"
autoCapitalize="none"
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

</View>
</View>
</LinearGradient>
);

}