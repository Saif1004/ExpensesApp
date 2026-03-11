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

type AuthContextType = {
  user: User | null;
  role: "admin" | "employee" | null;
  status: "approved" | "pending" | "none" | null;
  authLoaded: boolean;
};

export const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  status: null,
  authLoaded: false
});

export function useAuth() {
  return useContext(AuthContext);
}

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

    try {

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

    } catch(err){

      console.log("Membership load error:",err);

      setRole("employee");
      setStatus("none");

    }

  };

  //////////////////////////////////////////////////////
  // AUTH LISTENER
  //////////////////////////////////////////////////////

  useEffect(()=>{

    const unsub = onAuthStateChanged(auth, async(firebaseUser)=>{

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

    return unsub;

  },[]);

  //////////////////////////////////////////////////////
  // ROUTE PROTECTION
  //////////////////////////////////////////////////////

  useEffect(()=>{

    if(!authLoaded) return;

    const inTabs = segments[0] === "(tabs)";
    const inAuth = segments[0] === "sign-in" || segments[0] === "sign-up";

    //////////////////////////////////////////////////////
    // NOT LOGGED IN
    //////////////////////////////////////////////////////

    if(!user){

      if(inTabs){
        router.replace("/sign-in");
      }

      return;
    }

    //////////////////////////////////////////////////////
    // BLOCK PENDING USERS
    //////////////////////////////////////////////////////

    if(status === "pending"){

      if(inTabs){
        router.replace("/sign-in");
      }

      return;
    }

    //////////////////////////////////////////////////////
    // APPROVED USERS
    //////////////////////////////////////////////////////

    if(user && inAuth){
      router.replace("/(tabs)/home");
    }

  },[user,status,authLoaded,segments]);

  //////////////////////////////////////////////////////
  // CONTEXT VALUE
  //////////////////////////////////////////////////////

  const value = useMemo(()=>({
    user,
    role,
    status,
    authLoaded
  }),[user,role,status,authLoaded]);

  if(!authLoaded) return null;

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthProvider;