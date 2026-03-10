import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword
} from "firebase/auth";

import {
  doc,
  getDoc
} from "firebase/firestore";

import { useState } from "react";
import {
  ActivityIndicator,
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
  const [loading,setLoading] = useState(false);

  //////////////////////////////////////////////////////
  // FIND EMAIL FROM USERNAME
  //////////////////////////////////////////////////////

  const findEmailFromUsername = async (username:string) => {

    try{

      const normalized = username.trim().toLowerCase();

      // usernames/{username}
      const usernameDoc = await getDoc(doc(db,"usernames",normalized));

      if(!usernameDoc.exists()){
        return null;
      }

      const { uid } = usernameDoc.data();

      // users/{uid}
      const userDoc = await getDoc(doc(db,"users",uid));

      if(!userDoc.exists()){
        return null;
      }

      return userDoc.data().email;

    }catch(err){

      console.log("Username lookup error:",err);
      return null;

    }

  };

  //////////////////////////////////////////////////////
  // SIGN IN
  //////////////////////////////////////////////////////

  const handleSignIn = async () => {

    if(!identifier || !password){
      Alert.alert("Missing details","Enter email or username and password");
      return;
    }

    try{

      setLoading(true);

      let email = identifier.trim();

      ////////////////////////////////////
      // USERNAME LOGIN
      ////////////////////////////////////

      if(!identifier.includes("@")){

        const normalized = identifier.trim().toLowerCase();

        const foundEmail = await findEmailFromUsername(normalized);

        if(!foundEmail){
          setLoading(false);
          Alert.alert("User not found","No account with that username");
          return;
        }

        email = foundEmail;

      }

      await signInWithEmailAndPassword(auth,email,password);

      router.replace("/(tabs)/home");

    }catch(err){

      console.log(err);

      Alert.alert(
        "Sign in failed",
        "Incorrect email/username or password"
      );

    }finally{

      setLoading(false);

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

      await sendPasswordResetEmail(auth,identifier.trim());

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

          {/* EMAIL OR USERNAME */}

          <View style={tw`mb-4`}>

            <Text style={tw`text-slate-300 text-xs mb-1`}>
              Email or Username
            </Text>

            <TextInput
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="email or username"
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
            disabled={loading}
          >

            {loading
              ? <ActivityIndicator color="#fff"/>
              : <Text style={tw`text-white text-base font-semibold`}>Sign In</Text>
            }

          </TouchableOpacity>

          {/* SIGN UP */}

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