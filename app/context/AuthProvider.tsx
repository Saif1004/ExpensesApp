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
  authLoaded: boolean;
};

export const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  authLoaded: false
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {

  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<"admin" | "employee" | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  const router = useRouter();
  const segments = useSegments();

  //////////////////////////////////////////////////////
  // LOAD USER ROLE FROM MEMBERSHIP
  //////////////////////////////////////////////////////

  const loadRole = async (uid: string) => {

    try {

      const q = query(
        collection(db,"memberships"),
        where("userId","==",uid)
      );

      const snap = await getDocs(q);

      if(!snap.empty){

        const membership = snap.docs[0].data();

        setRole(membership.role ?? "employee");

      } else {

        setRole("employee");

      }

    } catch(err){

      console.log("Role fetch error:",err);
      setRole("employee");

    }

  };

  //////////////////////////////////////////////////////
  // AUTH LISTENER
  //////////////////////////////////////////////////////

  useEffect(()=>{

    const unsub = onAuthStateChanged(auth, async(firebaseUser)=>{

      setUser(firebaseUser);

      if(firebaseUser){

        await loadRole(firebaseUser.uid);

      } else {

        setRole(null);

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

    if(user){

      if(inAuth){
        router.replace("/(tabs)/home");
      }

    } else {

      if(inTabs){
        router.replace("/sign-in");
      }

    }

  },[user,authLoaded,segments]);

  //////////////////////////////////////////////////////
  // CONTEXT VALUE
  //////////////////////////////////////////////////////

  const value = useMemo(()=>({

    user,
    role,
    authLoaded

  }),[user,role,authLoaded]);

  if(!authLoaded) return null;

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );

}

export default AuthProvider;
