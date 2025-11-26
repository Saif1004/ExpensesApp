import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import React, { createContext, useEffect, useState } from "react";
import { auth } from "../firebase/firebaseConfig";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoaded(true);

      // If logged in, go to tabs
      if (firebaseUser) {
        router.replace("/(tabs)/explore");
      }

      // ❗ If NOT logged in → DO NOTHING (show home page normally)
    });

    return unsubscribe;
  }, []);

  // Don't render app until Firebase finishes loading
  if (!authLoaded) return null;

  return (
    <AuthContext.Provider value={{ user }}>
      {children}
    </AuthContext.Provider>
  );
}
