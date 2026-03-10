import { useEffect, useState } from "react";
import {
  Alert,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import {
  deleteUser,
  sendPasswordResetEmail,
  signOut,
  updateProfile
} from "firebase/auth";

import { useRouter } from "expo-router";

import { auth } from "../../app/firebase/firebaseConfig";

import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";

export default function ProfileScreen() {

  const router = useRouter();

  const [user,setUser] = useState(auth.currentUser);
  const [name,setName] = useState(auth.currentUser?.displayName || "");

  //////////////////////////////////////////////////////
  // REFRESH USER AFTER PROFILE UPDATE
  //////////////////////////////////////////////////////

  useEffect(()=>{
    setUser(auth.currentUser);
  },[]);

  //////////////////////////////////////////////////////
  // SAVE PROFILE
  //////////////////////////////////////////////////////

  const saveProfile = async () => {

    if(!auth.currentUser) return;

    try{

      await updateProfile(auth.currentUser,{
        displayName:name
      });

      setUser(auth.currentUser);

      Alert.alert("Success","Profile updated");

    }catch{

      Alert.alert("Error","Could not update profile");

    }

  };

  //////////////////////////////////////////////////////
  // RESET PASSWORD
  //////////////////////////////////////////////////////

  const resetPassword = async () => {

    if(!auth.currentUser?.email) return;

    try{

      await sendPasswordResetEmail(auth,auth.currentUser.email);

      Alert.alert(
        "Password Reset",
        "Check your email to reset your password."
      );

    }catch{

      Alert.alert("Error","Could not send reset email");

    }

  };

  //////////////////////////////////////////////////////
  // DELETE ACCOUNT
  //////////////////////////////////////////////////////

  const removeAccount = async () => {

    if(!auth.currentUser) return;

    Alert.alert(
      "Delete Account",
      "This action cannot be undone.",
      [
        {text:"Cancel",style:"cancel"},
        {
          text:"Delete",
          style:"destructive",
          onPress:async ()=>{

            try{

              await deleteUser(auth.currentUser!);

              router.replace("/home");

            }catch{

              Alert.alert(
                "Error",
                "You may need to log in again before deleting your account."
              );

            }

          }
        }
      ]
    );

  };

  //////////////////////////////////////////////////////
  // LOG OUT
  //////////////////////////////////////////////////////

  const logout = async () => {

    try{

      await signOut(auth);

      router.replace("/home");

    }catch{

      Alert.alert("Error","Could not log out");

    }

  };

  //////////////////////////////////////////////////////
  // UI
  //////////////////////////////////////////////////////

  return (

    <ThemedView style={styles.container}>

      <ThemedText type="title" style={styles.title}>
        Profile
      </ThemedText>

      {/* AVATAR */}

      <View style={styles.avatarContainer}>

        <View style={styles.avatar}>

          <ThemedText style={styles.avatarText}>
            {user?.displayName?.charAt(0)?.toUpperCase() ||
             user?.email?.charAt(0)?.toUpperCase()}
          </ThemedText>

        </View>

        <ThemedText style={styles.name}>
          {user?.displayName || "User"}
        </ThemedText>

        <ThemedText style={styles.email}>
          {user?.email}
        </ThemedText>

      </View>

      {/* PROFILE CARD */}

      <ThemedView style={styles.card}>

        <ThemedText style={styles.cardTitle}>
          Display Name
        </ThemedText>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor="#64748B"
          style={styles.input}
        />

        <TouchableOpacity
          style={styles.saveButton}
          onPress={saveProfile}
        >
          <ThemedText style={styles.saveText}>
            Save Profile
          </ThemedText>
        </TouchableOpacity>

      </ThemedView>

      {/* SECURITY CARD */}

      <ThemedView style={styles.card}>

        <TouchableOpacity onPress={resetPassword}>
          <ThemedText style={styles.actionText}>
            Reset Password
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={removeAccount}
        >
          <ThemedText style={styles.deleteText}>
            Delete Account
          </ThemedText>
        </TouchableOpacity>

      </ThemedView>

      {/* LOGOUT */}

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={logout}
      >

        <ThemedText style={styles.logoutText}>
          Log Out
        </ThemedText>

      </TouchableOpacity>

    </ThemedView>

  );

}

const styles = StyleSheet.create({

container:{
padding:20,
backgroundColor:"#0F172A",
minHeight:"100%"
},

title:{
fontSize:32,
fontWeight:"bold",
color:"#F8FAFC",
marginTop:24
},

avatarContainer:{
alignItems:"center",
marginBottom:20
},

avatar:{
width:70,
height:70,
borderRadius:35,
backgroundColor:"#2563EB",
justifyContent:"center",
alignItems:"center",
marginBottom:10
},

avatarText:{
color:"#FFF",
fontSize:26,
fontWeight:"bold"
},

name:{
color:"#F8FAFC",
fontSize:18,
fontWeight:"600"
},

email:{
color:"#94A3B8"
},

card:{
backgroundColor:"rgba(30,41,59,0.95)",
padding:16,
borderRadius:14,
marginBottom:20
},

cardTitle:{
color:"#E2E8F0",
marginBottom:8
},

input:{
backgroundColor:"#1E293B",
borderRadius:10,
padding:12,
color:"#FFF",
marginBottom:10
},

saveButton:{
backgroundColor:"#2563EB",
padding:10,
borderRadius:10,
alignItems:"center"
},

saveText:{
color:"#FFF",
fontWeight:"600"
},

actionText:{
color:"#38BDF8"
},

deleteButton:{
marginTop:10,
backgroundColor:"#DC2626",
padding:10,
borderRadius:10,
alignItems:"center"
},

deleteText:{
color:"#FFF"
},

logoutButton:{
backgroundColor:"#EF4444",
paddingVertical:12,
borderRadius:12,
alignItems:"center"
},

logoutText:{
color:"#FFFFFF",
fontSize:16,
fontWeight:"600"
}

});