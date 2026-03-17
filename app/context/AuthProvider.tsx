import { useRouter, useSegments } from "expo-router";
import { onAuthStateChanged, User } from "firebase/auth";

import {
  collection,
  getDocs,
  query,
  where
} from "firebase/firestore";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

import { auth, db } from "../firebase/firebaseConfig";

//////////////////////////////////////////////////////
// TYPES
//////////////////////////////////////////////////////

type AuthContextType = {
  user: User | null;
  role: "admin" | "employee" | null;
  status: "approved" | "pending" | "none" | null;
  authLoaded: boolean;
  refreshMembership: () => Promise<void>;
};

//////////////////////////////////////////////////////
// CONTEXT
//////////////////////////////////////////////////////

export const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  status: null,
  authLoaded: false,
  refreshMembership: async () => {}
});

export function useAuth() {
  return useContext(AuthContext);
}

//////////////////////////////////////////////////////
// PROVIDER
//////////////////////////////////////////////////////

export function AuthProvider({ children }: { children: React.ReactNode }) {

  const [user,setUser] = useState<User | null>(null);
  const [role,setRole] = useState<"admin" | "employee" | null>(null);
  const [status,setStatus] = useState<"approved" | "pending" | "none" | null>(null);
  const [authLoaded,setAuthLoaded] = useState(false);

  const router = useRouter();
  const segments = useSegments();

  //////////////////////////////////////////////////////
  // LOAD MEMBERSHIP
  //////////////////////////////////////////////////////

  const loadMembership = async(uid:string) => {

    try{

      const q = query(
        collection(db,"memberships"),
        where("userId","==",uid)
      );

      const snap = await getDocs(q);

      if(snap.empty){

        setRole("employee");
        setStatus("none");

        return;

      }

      const membership = snap.docs[0].data();

      setRole(membership.role ?? "employee");
      setStatus(membership.status ?? "none");

    }
    catch(err){

      console.log("Membership load error:",err);

      setRole("employee");
      setStatus("none");

    }

  };

  //////////////////////////////////////////////////////
  // REFRESH MEMBERSHIP
  //////////////////////////////////////////////////////

  const refreshMembership = async () => {
    if(user){
      await loadMembership(user.uid);
    }
  };

  //////////////////////////////////////////////////////
  // AUTH LISTENER
  //////////////////////////////////////////////////////

  useEffect(()=>{

    const unsubscribe = onAuthStateChanged(auth, async(firebaseUser)=>{

      if(firebaseUser){

        setUser(firebaseUser);

        await loadMembership(firebaseUser.uid);

      }
      else{

        setUser(null);
        setRole(null);
        setStatus(null);

      }

      setAuthLoaded(true);

    });

    return unsubscribe;

  },[]);

  //////////////////////////////////////////////////////
  // ROUTE PROTECTION
  //////////////////////////////////////////////////////

  useEffect(()=>{

    if(!authLoaded || (user && role === null)) return;

    const inTabs = segments[0] === "(tabs)";
    const inAuth = segments[0] === "sign-in" || segments[0] === "sign-up";

    if(!user){

      if(inTabs){
        router.replace("/sign-in");
      }

      return;

    }

    if(status === "pending"){

      if(inTabs){
        router.replace("/sign-in");
      }

      return;

    }

    if(user && inAuth){

      router.replace("/(tabs)/home");

    }

  },[user,status,authLoaded,role,segments]);

  //////////////////////////////////////////////////////
  // CONTEXT VALUE
  //////////////////////////////////////////////////////

  const value = useMemo(()=>({

    user,
    role,
    status,
    authLoaded,
    refreshMembership

  }),[user,role,status,authLoaded]);

  //////////////////////////////////////////////////////
  // BLOCK UNTIL ROLE READY
  //////////////////////////////////////////////////////

const roleLoaded = role !== null || !user;

if(!authLoaded || !roleLoaded){
  return null;
}

  return (

    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>

  );

}

export default AuthProvider;