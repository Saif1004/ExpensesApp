import {
    collection,
    onSnapshot,
    query,
    where
} from "firebase/firestore";

import React, { createContext, useContext, useEffect, useState } from "react";

import { db } from "../firebase/firebaseConfig";
import { useAuth } from "./AuthProvider";

type BadgeContextType = {
  claimsBadge: number;
  usersBadge: number;
  adminBadge: number;

  clearClaims: () => void;
  clearUsers: () => void;
  clearAdmin: () => void;
};

const BadgeContext = createContext<BadgeContextType>({
  claimsBadge: 0,
  usersBadge: 0,
  adminBadge: 0,
  clearClaims: () => {},
  clearUsers: () => {},
  clearAdmin: () => {}
});

export function useBadges(){
  return useContext(BadgeContext);
}

export function BadgeProvider({children}:{children:React.ReactNode}){

  const { user } = useAuth();

  const [claimsBadge,setClaimsBadge] = useState(0);
  const [usersBadge,setUsersBadge] = useState(0);
  const [adminBadge,setAdminBadge] = useState(0);

  //////////////////////////////////////////////////////
  // CLAIMS BADGE
  //////////////////////////////////////////////////////

  useEffect(()=>{

    if(!user) return;

    const q = query(
      collection(db,"claims"),
      where("status","==","pending")
    );

    const unsub = onSnapshot(q,(snap)=>{
      setClaimsBadge(snap.size);
    });

    return unsub;

  },[user]);

  //////////////////////////////////////////////////////
  // USERS BADGE (pending employees)
  //////////////////////////////////////////////////////

  useEffect(()=>{

    if(!user) return;

    const q = query(
      collection(db,"memberships"),
      where("status","==","pending")
    );

    const unsub = onSnapshot(q,(snap)=>{
      setUsersBadge(snap.size);
      setAdminBadge(snap.size);
    });

    return unsub;

  },[user]);

  //////////////////////////////////////////////////////
  // CLEAR FUNCTIONS
  //////////////////////////////////////////////////////

  const clearClaims = ()=>setClaimsBadge(0);
  const clearUsers = ()=>setUsersBadge(0);
  const clearAdmin = ()=>setAdminBadge(0);

  return(
    <BadgeContext.Provider
      value={{
        claimsBadge,
        usersBadge,
        adminBadge,
        clearClaims,
        clearUsers,
        clearAdmin
      }}
    >
      {children}
    </BadgeContext.Provider>
  );
}

export default BadgeProvider;