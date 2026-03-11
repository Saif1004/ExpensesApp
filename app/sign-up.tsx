import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

import {
  createUserWithEmailAndPassword,
  signOut,
  updateProfile
} from "firebase/auth";

import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch
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

const handleSignUp = async () => {

try{

const trimmedUsername=username.trim();
const normalizedUsername=trimmedUsername.toLowerCase();
const trimmedEmail=email.trim();
const trimmedOrg=organisation.trim();

if(!trimmedUsername||!trimmedEmail||!password||!confirmPassword||!trimmedOrg){
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
// CREATE AUTH USER
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
// CHECK IF ORGANISATION EXISTS
////////////////////////////////////////////////////

const orgQuery=query(
collection(db,"organisations"),
where("name","==",trimmedOrg)
);

const orgSnap=await getDocs(orgQuery);

////////////////////////////////////////////////////
// START BATCH
////////////////////////////////////////////////////

const batch=writeBatch(db);

const userRef=doc(db,"users",uid);
const usernameRef=doc(db,"usernames",normalizedUsername);

batch.set(userRef,{
uid,
email:trimmedEmail,
username:normalizedUsername,
displayName:trimmedUsername,
createdAt:serverTimestamp()
});

batch.set(usernameRef,{
uid
});

////////////////////////////////////////////////////
// NEW ORGANISATION → ADMIN
////////////////////////////////////////////////////

if(orgSnap.empty){

const orgRef=doc(collection(db,"organisations"));
const membershipRef=doc(collection(db,"memberships"));

batch.set(orgRef,{
name:trimmedOrg,
ownerId:uid,
createdAt:serverTimestamp()
});

batch.set(membershipRef,{
userId:uid,
orgId:orgRef.id,
role:"admin",
status:"approved",
createdAt:serverTimestamp()
});

await batch.commit();

Alert.alert("Organisation created. You are the admin.");

router.replace("/sign-in");

return;

}

////////////////////////////////////////////////////
// EXISTING ORGANISATION → EMPLOYEE
////////////////////////////////////////////////////

const orgId=orgSnap.docs[0].id;

const membershipRef=doc(collection(db,"memberships"));

batch.set(membershipRef,{
userId:uid,
orgId,
role:"employee",
status:"pending",
createdAt:serverTimestamp()
});

await batch.commit();

await signOut(auth);

Alert.alert(
"Account Created",
"Your account is pending admin approval."
);

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