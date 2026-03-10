import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TouchableOpacity,
  View
} from "react-native";

import {
  deleteUser,
  sendPasswordResetEmail,
  signOut
} from "firebase/auth";

import {
  doc,
  getDoc
} from "firebase/firestore";

import { useRouter } from "expo-router";

import { auth, db } from "../../app/firebase/firebaseConfig";

import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";

export default function ProfileScreen() {

  const router = useRouter();

  const [username,setUsername] = useState("");
  const [loading,setLoading] = useState(true);
  const [loggingOut,setLoggingOut] = useState(false);
  const [deleting,setDeleting] = useState(false);

  const user = auth.currentUser;

  //////////////////////////////////////////////////////
  // LOAD USER DATA
  //////////////////////////////////////////////////////

  useEffect(()=>{

    const loadUser = async () => {

      try{

        if(!user){
          setLoading(false);
          return;
        }

        const docRef = doc(db,"users",user.uid);
        const snap = await getDoc(docRef);

        if(snap.exists()){
          setUsername(snap.data().username);
        }

      }catch(err){
        console.log("User load error:",err);
      }

      setLoading(false);

    };

    loadUser();

  },[]);

  //////////////////////////////////////////////////////
  // RESET PASSWORD
  //////////////////////////////////////////////////////

  const resetPassword = async () => {

    if(!user?.email) return;

    Alert.alert(
      "Reset Password",
      "Send password reset email?",
      [
        {text:"Cancel",style:"cancel"},
        {
          text:"Send",
          onPress:async ()=>{

            try{

              await sendPasswordResetEmail(auth,user.email);

              Alert.alert(
                "Password Reset",
                "Check your email to reset your password."
              );

            }catch{
              Alert.alert("Error","Could not send reset email");
            }

          }
        }
      ]
    );

  };

  //////////////////////////////////////////////////////
  // DELETE ACCOUNT
  //////////////////////////////////////////////////////

  const removeAccount = () => {

    if(!user) return;

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

              setDeleting(true);

              await deleteUser(user);

              router.replace("/");

            }catch{

              Alert.alert(
                "Error",
                "You may need to log in again before deleting your account."
              );

            }finally{

              setDeleting(false);

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

      setLoggingOut(true);

      await signOut(auth);

      router.replace("/");

    }catch{

      Alert.alert("Error","Could not log out");

    }finally{

      setLoggingOut(false);

    }

  };

  //////////////////////////////////////////////////////
  // LOADING STATE
  //////////////////////////////////////////////////////

  if(loading){
    return(
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#3B82F6"/>
      </View>
    );
  }

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
            {username?.charAt(0)?.toUpperCase() || "U"}
          </ThemedText>

        </View>

        <ThemedText style={styles.name}>
          {username || "User"}
        </ThemedText>

        <ThemedText style={styles.email}>
          {user?.email}
        </ThemedText>

      </View>

      {/* ACCOUNT CARD */}

      <ThemedView style={styles.card}>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={resetPassword}
        >
          <ThemedText style={styles.actionText}>
            Reset Password
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={removeAccount}
          disabled={deleting}
        >

          {deleting
            ? <ActivityIndicator color="#fff"/>
            : <ThemedText style={styles.deleteText}>Delete Account</ThemedText>
          }

        </TouchableOpacity>

      </ThemedView>

      {/* LOGOUT */}

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={logout}
        disabled={loggingOut}
      >

        {loggingOut
          ? <ActivityIndicator color="#fff"/>
          : <ThemedText style={styles.logoutText}>Log Out</ThemedText>
        }

      </TouchableOpacity>

    </ThemedView>

  );

}

//////////////////////////////////////////////////////
// STYLES
//////////////////////////////////////////////////////

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
  marginTop:24,
  marginBottom:10
},

avatarContainer:{
  alignItems:"center",
  marginBottom:30
},

avatar:{
  width:80,
  height:80,
  borderRadius:40,
  backgroundColor:"#2563EB",
  justifyContent:"center",
  alignItems:"center",
  marginBottom:10
},

avatarText:{
  color:"#FFF",
  fontSize:30,
  fontWeight:"bold"
},

name:{
  color:"#F8FAFC",
  fontSize:20,
  fontWeight:"600"
},

email:{
  color:"#94A3B8",
  marginTop:4
},

card:{
  backgroundColor:"rgba(30,41,59,0.95)",
  padding:16,
  borderRadius:14,
  marginBottom:20
},

actionButton:{
  paddingVertical:8
},

actionText:{
  color:"#38BDF8",
  fontSize:16
},

deleteButton:{
  marginTop:14,
  backgroundColor:"#DC2626",
  padding:12,
  borderRadius:10,
  alignItems:"center"
},

deleteText:{
  color:"#FFF",
  fontWeight:"600"
},

logoutButton:{
  backgroundColor:"#EF4444",
  paddingVertical:14,
  borderRadius:12,
  alignItems:"center"
},

logoutText:{
  color:"#FFFFFF",
  fontSize:16,
  fontWeight:"600"
},

loading:{
  flex:1,
  justifyContent:"center",
  alignItems:"center",
  backgroundColor:"#0F172A"
}

});