import { useRouter, useSegments } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { createContext, useEffect, useState } from "react";
import { auth } from "../firebase/firebaseConfig";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  const router = useRouter();
  const segments = useSegments(); 

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoaded(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!authLoaded) return;

    const inTabs = segments[0] === "(tabs)";

    if (user && !inTabs) {
      router.replace("/(tabs)/home");
    }

    if (!user && inTabs) {
      router.replace("/sign-in"); 
    }
  }, [user, authLoaded, segments]);

  if (!authLoaded) return null;

  return (
    <AuthContext.Provider value={{ user }}>
      {children}
    </AuthContext.Provider>
  );
}