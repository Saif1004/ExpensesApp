import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useState } from "react";
import { Alert, Text, TextInput, TouchableOpacity, View } from "react-native";
import tw from "twrnc";

import { auth, db } from "./firebase/firebaseConfig";

export default function SignUp() {

  const router = useRouter();

  const [name,setName] = useState("");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");

  const handleSignUp = async () => {

    if(!name || !email || !password){
      Alert.alert("Missing details","Please fill all fields");
      return;
    }

    try{

      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      await updateProfile(cred.user,{
        displayName:name
      });

      await setDoc(doc(db,"users",cred.user.uid),{
        uid:cred.user.uid,
        email:cred.user.email,
        displayName:name,
        role:"employee",
        createdAt:serverTimestamp()
      });

    }catch(err:any){

      Alert.alert("Sign up failed",err.message);

    }

  };

  return (

    <LinearGradient colors={["#020617","#0F172A"]} style={{flex:1}}>

      <View style={{flex:1,paddingHorizontal:24,justifyContent:"center"}}>

        <View
          style={[
            {borderRadius:24,padding:20,backgroundColor:"rgba(31,41,55,0.9)"},
            tw`shadow-lg`
          ]}
        >

          <Text style={tw`text-slate-100 text-2xl font-bold mb-2`}>
            Create Account
          </Text>

          {/* NAME */}
          <View style={tw`mb-4`}>
            <Text style={tw`text-slate-300 text-xs mb-1`}>
              Name
            </Text>

            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor="#64748B"
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

          {/* EMAIL */}
          <View style={tw`mb-4`}>
            <Text style={tw`text-slate-300 text-xs mb-1`}>
              Email
            </Text>

            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor="#64748B"
              autoCapitalize="none"
              keyboardType="email-address"
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
          <View style={tw`mb-6`}>
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

          <TouchableOpacity
            style={[
              {
                paddingVertical:12,
                borderRadius:9999,
                alignItems:"center",
                marginBottom:12
              },
              tw`bg-blue-500`
            ]}
            onPress={handleSignUp}
          >
            <Text style={tw`text-white text-base font-semibold`}>
              Create Account
            </Text>
          </TouchableOpacity>

          {/* BACK TO SIGN IN */}

          <TouchableOpacity
            onPress={()=>router.replace("/sign-in")}
          >
            <Text style={tw`text-slate-400 text-center text-xs`}>
              Already have an account? Sign In
            </Text>
          </TouchableOpacity>

        </View>

      </View>

    </LinearGradient>

  );

}