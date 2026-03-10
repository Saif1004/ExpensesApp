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

      if(!user) return;

      const docRef = doc(db,"users",user.uid);
      const snap = await getDoc(docRef);

      if(snap.exists()){
        setUsername(snap.data().username);
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

    try{

      await sendPasswordResetEmail(auth,user.email);

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

              router.replace("/home");

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

      router.replace("/home");

    }catch{

      Alert.alert("Error","Could not log out");

    }finally{

      setLoggingOut(false);

    }

  };

  //////////////////////////////////////////////////////
  // UI
  //////////////////////////////////////////////////////

  if(loading){
    return(
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#3B82F6"/>
      </View>
    );
  }

  return (

    <ThemedView style={styles.container}>

      <ThemedText type="title" style={styles.title}>
        Profile
      </ThemedText>

      {/* AVATAR */}

      <View style={styles.avatarContainer}>

        <View style={styles.avatar}>

          <ThemedText style={styles.avatarText}>
            {username?.charAt(0)?.toUpperCase()}
          </ThemedText>

        </View>

        <ThemedText style={styles.name}>
          {username}
        </ThemedText>

        <ThemedText style={styles.email}>
          {user?.email}
        </ThemedText>

      </View>

      {/* SECURITY */}

      <ThemedView style={styles.card}>

        <TouchableOpacity onPress={resetPassword}>
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
},

loading:{
flex:1,
justifyContent:"center",
alignItems:"center",
backgroundColor:"#0F172A"
}

});