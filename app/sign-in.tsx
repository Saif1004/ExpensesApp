import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword
} from "firebase/auth";

import {
  collection,
  getDocs,
  query,
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

export default function SignIn() {

  const router = useRouter();

  const [identifier,setIdentifier] = useState("");
  const [password,setPassword] = useState("");

  //////////////////////////////////////////////////////
  // FIND EMAIL FROM DISPLAY NAME
  //////////////////////////////////////////////////////

  const findEmailFromDisplayName = async (name:string) => {

    const q = query(
      collection(db,"users"),
      where("displayName","==",name)
    );

    const snap = await getDocs(q);

    if(!snap.empty){
      return snap.docs[0].data().email;
    }

    return null;

  };

  //////////////////////////////////////////////////////
  // SIGN IN
  //////////////////////////////////////////////////////

  const handleSignIn = async () => {

    if(!identifier || !password){
      Alert.alert("Missing details","Enter email/name and password");
      return;
    }

    try{

      let email = identifier.trim();

      // If user typed display name instead of email
      if(!identifier.includes("@")){

        const foundEmail = await findEmailFromDisplayName(identifier);

        if(!foundEmail){
          Alert.alert("User not found","No account with that display name");
          return;
        }

        email = foundEmail;

      }

      await signInWithEmailAndPassword(auth,email,password);

    }catch(err:any){

      Alert.alert("Sign in failed",err.message);

    }

  };

  //////////////////////////////////////////////////////
  // FORGOT PASSWORD
  //////////////////////////////////////////////////////

  const forgotPassword = async () => {

    if(!identifier.includes("@")){
      Alert.alert(
        "Enter Email",
        "Password reset requires your email address."
      );
      return;
    }

    try{

      await sendPasswordResetEmail(auth,identifier);

      Alert.alert(
        "Password Reset",
        "Check your email for reset instructions."
      );

    }catch(err:any){

      Alert.alert("Error",err.message);

    }

  };

  //////////////////////////////////////////////////////
  // UI
  //////////////////////////////////////////////////////

  return (

    <LinearGradient colors={["#020617","#0F172A"]} style={{flex:1}}>

      <View style={{flex:1,paddingHorizontal:24,justifyContent:"center"}}>

        <View
          style={[
            {
              borderRadius:24,
              padding:20,
              backgroundColor:"rgba(31,41,55,0.9)"
            },
            tw`shadow-lg`
          ]}
        >

          <Text style={tw`text-slate-100 text-2xl font-bold mb-2`}>
            Sign In
          </Text>

          {/* EMAIL OR NAME */}

          <View style={tw`mb-4`}>

            <Text style={tw`text-slate-300 text-xs mb-1`}>
              Email or Display Name
            </Text>

            <TextInput
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="you@email.com or username"
              placeholderTextColor="#64748B"
              autoCapitalize="none"
              style={[
                {
                  paddingVertical:10,
                  paddingHorizontal:16,
                  borderRadius:9999,
                  borderWidth:1
                },
                tw`border-slate-700 text-slate-100`
              ]}
            />

          </View>

          {/* PASSWORD */}

          <View style={tw`mb-4`}>

            <Text style={tw`text-slate-300 text-xs mb-1`}>
              Password
            </Text>

            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#64748B"
              secureTextEntry
              style={[
                {
                  paddingVertical:10,
                  paddingHorizontal:16,
                  borderRadius:9999,
                  borderWidth:1
                },
                tw`border-slate-700 text-slate-100`
              ]}
            />

          </View>

          {/* FORGOT PASSWORD */}

          <TouchableOpacity onPress={forgotPassword}>

            <Text style={tw`text-blue-400 text-xs mb-4`}>
              Forgot password?
            </Text>

          </TouchableOpacity>

          {/* SIGN IN BUTTON */}

          <TouchableOpacity
            style={[
              {
                paddingVertical:12,
                borderRadius:9999,
                alignItems:"center",
                marginBottom:10
              },
              tw`bg-blue-500`
            ]}
            onPress={handleSignIn}
          >

            <Text style={tw`text-white text-base font-semibold`}>
              Sign In
            </Text>

          </TouchableOpacity>

          {/* SIGN UP NAVIGATION */}

          <TouchableOpacity
            onPress={()=>router.push("/sign-up")}
          >

            <Text style={tw`text-slate-400 text-center text-xs mt-2`}>
              Don't have an account? Sign Up
            </Text>

          </TouchableOpacity>

        </View>

      </View>

    </LinearGradient>

  );

}