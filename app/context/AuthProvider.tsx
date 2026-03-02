import { useRouter, useSegments } from "expo-router";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
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
  authLoaded: false,
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

  // 🔥 Auth + Role Fetch
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, "users", firebaseUser.uid));
          if (snap.exists()) {
            setRole(snap.data().role ?? "employee");
          } else {
            setRole("employee");
          }
        } catch {
          setRole("employee");
        }
      } else {
        setRole(null);
      }

      setAuthLoaded(true);
    });

    return unsub;
  }, []);

  // 🔥 Route Protection
  useEffect(() => {
    if (!authLoaded) return;

    const inTabs = segments[0] === "(tabs)";
    const inAuthScreens =
      segments[0] === "sign-in" || segments[0] === "sign-up";

    if (user) {
      if (!inTabs) router.replace("/(tabs)/home");
    } else {
      if (inTabs) router.replace("/home");
    }
  }, [user, authLoaded, segments, router]);

  const value = useMemo(
    () => ({ user, role, authLoaded }),
    [user, role, authLoaded]
  );

  if (!authLoaded) return null;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;