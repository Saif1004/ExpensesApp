import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where
} from "firebase/firestore";

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

import { auth, db } from "../firebase/firebaseConfig";

type PendingUser = {
  id: string;
  userId: string;
  displayName?: string;
  email?: string;
  role?: string;
  status?: string;
};

export default function AdminUsers() {

  const [users,setUsers] = useState<PendingUser[]>([]);
  const [loading,setLoading] = useState(true);

  //////////////////////////////////////////////////////
  // LOAD USERS
  //////////////////////////////////////////////////////

  const loadUsers = async () => {

    try{

      setLoading(true);

      if(!auth.currentUser){
        setUsers([]);
        setLoading(false);
        return;
      }

      //////////////////////////////////////////////////////
      // FIND ADMIN MEMBERSHIP
      //////////////////////////////////////////////////////

      const membershipQuery = query(
        collection(db,"memberships"),
        where("userId","==",auth.currentUser.uid)
      );

      const membershipSnap = await getDocs(membershipQuery);

      if(membershipSnap.empty){
        setUsers([]);
        setLoading(false);
        return;
      }

      const adminMembership = membershipSnap.docs[0].data();
      const orgId = adminMembership.orgId;

      //////////////////////////////////////////////////////
      // GET PENDING MEMBERS
      //////////////////////////////////////////////////////

      const q = query(
        collection(db,"memberships"),
        where("orgId","==",orgId),
        where("status","==","pending")
      );

      const snap = await getDocs(q);

      const list:PendingUser[] = [];

      for(const docSnap of snap.docs){

        const membership = docSnap.data();

        const userDoc = await getDoc(
          doc(db,"users",membership.userId)
        );

        const userData = userDoc.exists() ? userDoc.data() : {};

        list.push({
          id: docSnap.id,
          userId: membership.userId,
          role: membership.role,
          status: membership.status,
          displayName: userData.displayName,
          email: userData.email
        });

      }

      setUsers(list);

    }catch(error){

      console.log("LOAD USERS ERROR:",error);
      Alert.alert("Error","Could not load pending users.");

    }finally{

      setLoading(false);

    }

  };

  useEffect(()=>{
    loadUsers();
  },[]);

  //////////////////////////////////////////////////////
  // APPROVE USER
  //////////////////////////////////////////////////////

  const approveUser = async (membershipId:string) => {

    try{

      await updateDoc(
        doc(db,"memberships",membershipId),
        { status:"approved" }
      );

      loadUsers();

    }catch(error){

      console.log("APPROVE ERROR:",error);
      Alert.alert("Error","Could not approve user.");

    }

  };

  //////////////////////////////////////////////////////
  // REJECT USER
  //////////////////////////////////////////////////////

  const rejectUser = async (membershipId:string) => {

    try{

      await updateDoc(
        doc(db,"memberships",membershipId),
        { status:"rejected" }
      );

      loadUsers();

    }catch(error){

      console.log("REJECT ERROR:",error);
      Alert.alert("Error","Could not reject user.");

    }

  };

  //////////////////////////////////////////////////////
  // UI
  //////////////////////////////////////////////////////

  return(

    <View style={styles.container}>

      <Text style={styles.title}>
        Admin Panel
      </Text>

      {loading ? (

        <ActivityIndicator color="#3B82F6" size="large"/>

      ):(

        <ScrollView>

          {users.length===0 ? (

            <Text style={styles.empty}>
              No pending users
            </Text>

          ):(

            users.map((user)=>(

              <View key={user.id} style={styles.card}>

                <Text style={styles.name}>
                  {user.displayName || "Unknown"}
                </Text>

                <Text style={styles.email}>
                  {user.email || "No email"}
                </Text>

                <Text style={styles.role}>
                  Role: {user.role}
                </Text>

                <View style={styles.buttons}>

                  <TouchableOpacity
                    style={styles.approve}
                    onPress={()=>approveUser(user.id)}
                  >
                    <Text style={styles.approveText}>
                      Approve
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.reject}
                    onPress={()=>rejectUser(user.id)}
                  >
                    <Text style={styles.rejectText}>
                      Reject
                    </Text>
                  </TouchableOpacity>

                </View>

              </View>

            ))

          )}

        </ScrollView>

      )}

    </View>

  );

}

const styles = StyleSheet.create({

  container:{
    flex:1,
    backgroundColor:"#0F172A",
    padding:20
  },

  title:{
    color:"#F8FAFC",
    fontSize:26,
    fontWeight:"bold",
    marginBottom:20
  },

  card:{
    backgroundColor:"#1E293B",
    padding:16,
    borderRadius:12,
    marginBottom:12
  },

  name:{
    color:"#F8FAFC",
    fontSize:16,
    fontWeight:"600"
  },

  email:{
    color:"#94A3B8",
    marginTop:4
  },

  role:{
    color:"#64748B",
    marginTop:4,
    fontSize:12
  },

  buttons:{
    flexDirection:"row",
    marginTop:10,
    gap:10
  },

  approve:{
    flex:1,
    backgroundColor:"#2563EB",
    padding:10,
    borderRadius:8,
    alignItems:"center"
  },

  reject:{
    flex:1,
    backgroundColor:"#DC2626",
    padding:10,
    borderRadius:8,
    alignItems:"center"
  },

  approveText:{
    color:"#fff",
    fontWeight:"600"
  },

  rejectText:{
    color:"#fff",
    fontWeight:"600"
  },

  empty:{
    color:"#94A3B8",
    textAlign:"center",
    marginTop:30
  }

});