import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword, deleteUser, updateProfile } from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from "firebase/firestore";

import { useState } from "react";
import { Alert, Text, TextInput, TouchableOpacity, View } from "react-native";
import tw from "twrnc";

import { auth, db } from "./firebase/firebaseConfig";

const ADMIN_INVITE_CODE = "7421";

export default function SignUp() {

  const router = useRouter();

  const [username,setUsername] = useState("");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [confirmPassword,setConfirmPassword] = useState("");
  const [role,setRole] = useState("employee");
  const [inviteCode,setInviteCode] = useState("");

  //////////////////////////////////////////////////////
  // PASSWORD VALIDATION
  //////////////////////////////////////////////////////

  const validatePassword = (value:string) => {
    const regex = /^(?=.*[0-9])(?=.*[!@#$%^&*]).{8,}$/;
    return regex.test(value);
  };

  //////////////////////////////////////////////////////
  // USERNAME VALIDATION
  //////////////////////////////////////////////////////

  const usernameRegex = /^[a-zA-Z0-9_.]+$/;

  //////////////////////////////////////////////////////
  // USERNAME EXISTS CHECK
  //////////////////////////////////////////////////////

  const usernameExists = async (username:string) => {

    const ref = doc(db,"usernames",username);
    const snap = await getDoc(ref);

    return snap.exists();

  };

  //////////////////////////////////////////////////////
  // SIGN UP
  //////////////////////////////////////////////////////

  const handleSignUp = async () => {

    const trimmedUsername = username.trim();
    const normalizedUsername = trimmedUsername.toLowerCase();
    const trimmedEmail = email.trim();

    if(!trimmedUsername || !trimmedEmail || !password || !confirmPassword){
      Alert.alert("Missing details","Please fill all fields");
      return;
    }

    if(!usernameRegex.test(trimmedUsername)){
      Alert.alert(
        "Invalid username",
        "Username can only contain letters, numbers, _ and ."
      );
      return;
    }

    if(password !== confirmPassword){
      Alert.alert("Password mismatch","Passwords do not match");
      return;
    }

    if(!validatePassword(password)){
      Alert.alert(
        "Weak password",
        "Password must contain:\n\n• 8 characters\n• 1 number\n• 1 special character"
      );
      return;
    }

    if(role === "admin" && inviteCode !== ADMIN_INVITE_CODE){
      Alert.alert("Invalid invite code","Admin invite code is incorrect");
      return;
    }

    try{

      const exists = await usernameExists(normalizedUsername);

      if(exists){
        Alert.alert("Username taken","This username is already in use");
        return;
      }

      const cred = await createUserWithEmailAndPassword(
        auth,
        trimmedEmail,
        password
      );

      const uid = cred.user.uid;

      await updateProfile(cred.user,{
        displayName: trimmedUsername
      });

      //////////////////////////////////////////////////////
      // USERS COLLECTION
      //////////////////////////////////////////////////////

      await setDoc(doc(db,"users",uid),{
        uid,
        email: trimmedEmail,
        displayName: trimmedUsername,
        username: normalizedUsername,
        role,
        status: role === "admin" ? "approved" : "pending",
        createdAt: serverTimestamp()
      });

      //////////////////////////////////////////////////////
      // USERNAME LOOKUP COLLECTION
      //////////////////////////////////////////////////////

      await setDoc(doc(db,"usernames",normalizedUsername),{
        uid,
        createdAt: serverTimestamp()
      });

      Alert.alert(
        "Account Created",
        role === "employee"
        ? "Your account is awaiting admin approval."
        : "Admin account created successfully."
      );

      router.replace("/sign-in");

    }catch(err:any){

      if(auth.currentUser){
        await deleteUser(auth.currentUser);
      }

      Alert.alert("Sign up failed",err.message);

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
            Create Account
          </Text>

          {/* ACCOUNT TYPE */}

          <Text style={tw`text-slate-300 text-xs mb-2`}>
            Account Type
          </Text>

          <View style={tw`flex-row mb-4`}>

            <TouchableOpacity
              style={[
                tw`flex-1 py-2 rounded-l-full items-center`,
                role === "employee" ? tw`bg-blue-500` : tw`bg-slate-700`
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
                role === "admin" ? tw`bg-blue-500` : tw`bg-slate-700`
              ]}
              onPress={()=>setRole("admin")}
            >
              <Text style={tw`text-white text-xs font-semibold`}>
                Admin
              </Text>
            </TouchableOpacity>

          </View>

          {/* ADMIN INVITE CODE */}

          {role === "admin" && (

            <View style={tw`mb-4`}>

              <Text style={tw`text-slate-300 text-xs mb-1`}>
                Admin Invite Code
              </Text>

              <TextInput
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder="Enter invite code"
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

          )}

          {/* USERNAME */}

          <View style={tw`mb-4`}>

            <Text style={tw`text-slate-300 text-xs mb-1`}>
              Username
            </Text>

            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="Enter username"
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

          <View style={tw`mb-2`}>

            <Text style={tw`text-slate-300 text-xs mb-1`}>
              Password
            </Text>

            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password"
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

          {/* PASSWORD RULES */}

          <Text style={tw`text-slate-500 text-xs mb-4`}>
            Password must contain:
            {"\n"}• 8 characters
            {"\n"}• 1 number
            {"\n"}• 1 special character
          </Text>

          {/* CONFIRM PASSWORD */}

          <View style={tw`mb-6`}>

            <Text style={tw`text-slate-300 text-xs mb-1`}>
              Confirm Password
            </Text>

            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Re-enter password"
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

          {/* SIGN UP BUTTON */}

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