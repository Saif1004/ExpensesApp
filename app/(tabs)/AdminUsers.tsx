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

import { SafeAreaView } from "react-native-safe-area-context";

import { auth, db } from "../firebase/firebaseConfig";

type UserItem = {
  id: string;
  userId: string;
  displayName?: string;
  email?: string;
  role?: string;
  status?: string;
};

export default function AdminUsers() {

  const [users,setUsers] = useState<UserItem[]>([]);
  const [loading,setLoading] = useState(true);

  const [tab,setTab] = useState<"pending"|"approved"|"rejected">("pending");

  const [pendingCount,setPendingCount] = useState(0);

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
      // ADMIN MEMBERSHIP
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
      // QUERY MEMBERS BY STATUS
      //////////////////////////////////////////////////////

      const q = query(
        collection(db,"memberships"),
        where("orgId","==",orgId),
        where("status","==",tab)
      );

      const snap = await getDocs(q);

      const list:UserItem[] = [];

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

      //////////////////////////////////////////////////////
      // UPDATE BADGE COUNT
      //////////////////////////////////////////////////////

      if(tab === "pending"){
        setPendingCount(list.length);
      }

    }
    catch(error){

      console.log("LOAD USERS ERROR:",error);
      Alert.alert("Error","Could not load users.");

    }
    finally{

      setLoading(false);

    }

  };

  //////////////////////////////////////////////////////
  // LOAD BADGE COUNT
  //////////////////////////////////////////////////////

  const loadPendingCount = async () => {

    try{

      if(!auth.currentUser) return;

      const membershipQuery = query(
        collection(db,"memberships"),
        where("userId","==",auth.currentUser.uid)
      );

      const membershipSnap = await getDocs(membershipQuery);

      if(membershipSnap.empty) return;

      const orgId = membershipSnap.docs[0].data().orgId;

      const q = query(
        collection(db,"memberships"),
        where("orgId","==",orgId),
        where("status","==","pending")
      );

      const snap = await getDocs(q);

      setPendingCount(snap.size);

    }catch(err){

      console.log("COUNT ERROR:",err);

    }

  };

  useEffect(()=>{
    loadPendingCount();
  },[]);

  useEffect(()=>{
    loadUsers();
  },[tab]);

  //////////////////////////////////////////////////////
  // APPROVE
  //////////////////////////////////////////////////////

  const approveUser = async (membershipId:string) => {

    try{

      await updateDoc(
        doc(db,"memberships",membershipId),
        { status:"approved" }
      );

      loadUsers();
      loadPendingCount();

    }
    catch(error){

      console.log("APPROVE ERROR:",error);
      Alert.alert("Error","Could not approve user.");

    }

  };

  //////////////////////////////////////////////////////
  // REJECT
  //////////////////////////////////////////////////////

  const rejectUser = async (membershipId:string) => {

    try{

      await updateDoc(
        doc(db,"memberships",membershipId),
        { status:"rejected" }
      );

      loadUsers();
      loadPendingCount();

    }
    catch(error){

      console.log("REJECT ERROR:",error);
      Alert.alert("Error","Could not reject user.");

    }

  };

  //////////////////////////////////////////////////////
  // TAB BUTTON
  //////////////////////////////////////////////////////

  const TabButton = (name:"pending"|"approved"|"rejected",label:string) => (

    <TouchableOpacity
      style={[
        styles.tab,
        tab === name && styles.tabActive
      ]}
      onPress={()=>{

        setTab(name);

        if(name === "pending"){
          setPendingCount(0);
        }

      }}
    >

      <Text style={[
        styles.tabText,
        tab === name && styles.tabTextActive
      ]}>
        {label}
      </Text>

      {name === "pending" && pendingCount > 0 && (

        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {pendingCount}
          </Text>
        </View>

      )}

    </TouchableOpacity>

  );

  //////////////////////////////////////////////////////
  // UI
  //////////////////////////////////////////////////////

  return(

    <SafeAreaView style={styles.container}>

      <Text style={styles.title}>
        Admin Panel
      </Text>

      <View style={styles.tabs}>

        {TabButton("pending","Pending")}
        {TabButton("approved","Approved")}
        {TabButton("rejected","Rejected")}

      </View>

      {loading ? (

        <ActivityIndicator color="#3B82F6" size="large"/>

      ):(

        <ScrollView>

          {users.length===0 ? (

            <Text style={styles.empty}>
              No {tab} users
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

                {tab === "pending" && (

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

                )}

              </View>

            ))

          )}

        </ScrollView>

      )}

    </SafeAreaView>

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
    marginBottom:16
  },

  tabs:{
    flexDirection:"row",
    marginBottom:20,
    gap:10
  },

  tab:{
    flex:1,
    padding:10,
    borderRadius:10,
    backgroundColor:"#1E293B",
    alignItems:"center",
    flexDirection:"row",
    justifyContent:"center",
    gap:6
  },

  tabActive:{
    backgroundColor:"#2563EB"
  },

  tabText:{
    color:"#94A3B8",
    fontWeight:"600"
  },

  tabTextActive:{
    color:"#fff"
  },

  badge:{
    backgroundColor:"#DC2626",
    borderRadius:10,
    paddingHorizontal:6,
    paddingVertical:2
  },

  badgeText:{
    color:"#fff",
    fontSize:10,
    fontWeight:"700"
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