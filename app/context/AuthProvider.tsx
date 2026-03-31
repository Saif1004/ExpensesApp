import { useRouter, useSegments } from "expo-router";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import Constants from "expo-constants";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from "firebase/firestore";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { AppState, Platform } from "react-native";
import { PLAN_LIMITS, OrgPlan } from "../../constants/planLimits";
import { auth, db } from "../firebase/firebaseConfig";
import { unsubscribeAll } from "../../utils/listenerStore";
import { getIsSigningUp } from "../utils/signUpFlag";

//////////////////////////////////////////////////////
// MODULE-LEVEL GUARDS
//////////////////////////////////////////////////////

// True when running inside Expo Go (purchases not supported)
const isExpoGo = Constants.executionEnvironment === "storeClient";

// Prevents configure() being called twice (survives StrictMode double-mount)
let rcConfigured = false;

// Throttle RevenueCat syncs to at most once per 60 seconds
let lastRcSync = 0;
const RC_SYNC_COOLDOWN_MS = 60_000;

//////////////////////////////////////////////////////
// TYPES
//////////////////////////////////////////////////////

type AuthContextType = {
  user: User | null;
  role: "admin" | "employee" | null;
  status: "approved" | "pending" | "none" | null;
  orgId: string | null;
  orgPlan: OrgPlan;
  isPro: boolean;
  aiCreditsRemaining: number;
  employeeLimit: number;
  trialEndsAt: Date | null;
  trialDaysLeft: number;
  authLoaded: boolean;
  refreshMembership: () => Promise<void>;
  refreshOrgPlan: () => Promise<void>;
};

//////////////////////////////////////////////////////
// CONTEXT
//////////////////////////////////////////////////////

export const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  status: null,
  orgId: null,
  orgPlan: "free",
  isPro: false,
  aiCreditsRemaining: 0,
  employeeLimit: 5,
  trialEndsAt: null,
  trialDaysLeft: 0,
  authLoaded: false,
  refreshMembership: async () => {},
  refreshOrgPlan: async () => {}
});

export function useAuth() {
  return useContext(AuthContext);
}

//////////////////////////////////////////////////////
// PROVIDER
//////////////////////////////////////////////////////

export function AuthProvider({ children }: { children: React.ReactNode }) {

  const [user, setUser]     = useState<User | null>(null);
  const [role, setRole]     = useState<"admin" | "employee" | null>(null);
  const [status, setStatus] = useState<"approved" | "pending" | "none" | null>(null);
  const [orgId, setOrgId]   = useState<string | null>(null);
  const [orgPlan, setOrgPlan]                       = useState<OrgPlan>("free");
  const [aiCreditsRemaining, setAiCreditsRemaining] = useState(0);
  const [trialEndsAt, setTrialEndsAt]               = useState<Date | null>(null);
  const [authLoaded, setAuthLoaded]                 = useState(false);

  const router   = useRouter();
  const segments = useSegments();

  // Keeps track of current user uid for AppState refresh
  const currentUidRef  = useRef<string | null>(null);
  const currentRoleRef = useRef<string | null>(null);
  const currentOrgRef  = useRef<string | null>(null);

  //////////////////////////////////////////////////////
  // REVENUECAT INIT (once, native only)
  //////////////////////////////////////////////////////

  const initRevenueCat = useCallback(async () => {
    // Skip RC in dev builds — billing unavailable & keys won't validate
    if (rcConfigured || Platform.OS === "web" || isExpoGo || __DEV__) return;
    rcConfigured = true;
    try {
      const Purchases = (await import("react-native-purchases")).default;
      const apiKey = Platform.OS === "ios"
        ? process.env.EXPO_PUBLIC_RC_IOS_KEY!
        : process.env.EXPO_PUBLIC_RC_ANDROID_KEY!;
      Purchases.configure({ apiKey });
    } catch (err) {
      console.log("RevenueCat init error:", err);
    }
  }, []);

  //////////////////////////////////////////////////////
  // REVENUECAT SYNC (admin only — syncs entitlements → Firestore)
  //////////////////////////////////////////////////////

  const syncRevenueCat = useCallback(async (uid: string, oid: string) => {
    if (Platform.OS === "web" || isExpoGo || __DEV__) return;
    const now = Date.now();
    if (now - lastRcSync < RC_SYNC_COOLDOWN_MS) return;
    lastRcSync = now;
    try {
      const Purchases = (await import("react-native-purchases")).default;
      await Purchases.logIn(uid);

      // Verify entitlements server-side via Azure Function — client cannot
      // write plan/aiCreditsRemaining directly (Firestore rules block it).
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      await fetch(process.env.EXPO_PUBLIC_SYNC_PLAN_URL!, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body:    JSON.stringify({ orgId: oid }),
      });
      // refreshOrgPlan() will be called by the caller (loadOrgData) after this returns
    } catch (err) {
      console.log("RevenueCat sync error:", err);
    }
  }, []);

  //////////////////////////////////////////////////////
  // LOAD ORG DATA
  //////////////////////////////////////////////////////

  const loadOrgData = useCallback(async (oid: string, memberRole: string, uid: string) => {
    const orgSnap = await getDoc(doc(db, "organisations", oid));
    const data    = orgSnap.data() || {};

    const plan       = (data.plan ?? "free") as OrgPlan;
    const trialEnd   = data.trialEndsAt?.toDate?.() ?? null;
    const credits    = data.aiCreditsRemaining ?? 0;

    setOrgPlan(plan);
    setTrialEndsAt(trialEnd);
    setAiCreditsRemaining(credits);

    // Admin: sync RevenueCat → Firestore (fire-and-forget; plan refreshes on next loadOrgData)
    if (memberRole === "admin") {
      syncRevenueCat(uid, oid).then(async () => {
        // Re-read org after sync so the UI reflects any plan change
        const refreshed = await getDoc(doc(db, "organisations", oid));
        const d = refreshed.data() || {};
        setOrgPlan((d.plan ?? "free") as OrgPlan);
        setAiCreditsRemaining(d.aiCreditsRemaining ?? 0);
        setTrialEndsAt(d.trialEndsAt?.toDate?.() ?? null);
      }).catch(() => {});
    }
  }, [syncRevenueCat]);

  //////////////////////////////////////////////////////
  // LOAD MEMBERSHIP + ORG
  //////////////////////////////////////////////////////

  const loadMembership = useCallback(async (uid: string) => {
    try {
      const snap = await getDocs(
        query(collection(db, "memberships"), where("userId", "==", uid))
      );

      if (snap.empty) {
        setRole("employee");
        setStatus("none");
        setOrgId(null);
        currentRoleRef.current = "employee";
        currentOrgRef.current  = null;
        return;
      }

      const membership = snap.docs[0].data();
      const memberRole = (membership.role ?? "employee") as "admin" | "employee";
      const memberStatus = (membership.status ?? "none") as "approved" | "pending" | "none";
      const oid = membership.orgId ?? null;

      setRole(memberRole);
      setStatus(memberStatus);
      setOrgId(oid);
      currentRoleRef.current = memberRole;
      currentOrgRef.current  = oid;

      if (oid) {
        await loadOrgData(oid, memberRole, uid);
      }
    } catch (err) {
      console.log("Membership load error:", err);
      setRole("employee");
      setStatus("none");
    }
  }, [loadOrgData]);

  //////////////////////////////////////////////////////
  // REFRESH ORG PLAN (called after purchase)
  //////////////////////////////////////////////////////

  const refreshOrgPlan = useCallback(async () => {
    const oid = currentOrgRef.current;
    const uid = currentUidRef.current;
    const r   = currentRoleRef.current;
    if (!oid || !uid || !r) return;
    await loadOrgData(oid, r, uid);
  }, [loadOrgData]);

  const refreshMembership = useCallback(async () => {
    if (currentUidRef.current) {
      await loadMembership(currentUidRef.current);
    }
  }, [loadMembership]);

  //////////////////////////////////////////////////////
  // AUTH STATE LISTENER
  //////////////////////////////////////////////////////

  useEffect(() => {
    initRevenueCat();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Reload to get latest emailVerified status, then force-refresh the JWT
        // so Firestore rules see the updated email_verified claim immediately.
        try {
          await firebaseUser.reload();
          await firebaseUser.getIdToken(true); // force new JWT with fresh claims
        } catch {}

        // Block unverified users — sign them out so they can't access the app.
        // Exception: skip during sign-up flow so the batch writes can complete
        // before the user is signed out (signUpFlag prevents the race condition).
        if (!firebaseUser.emailVerified && !getIsSigningUp()) {
          await signOut(auth);
          setAuthLoaded(true);
          return;
        }

        setUser(firebaseUser);
        currentUidRef.current = firebaseUser.uid;
        await loadMembership(firebaseUser.uid);
      } else {
        unsubscribeAll();
        setUser(null);
        setRole(null);
        setStatus(null);
        setOrgId(null);
        setOrgPlan("free");
        setAiCreditsRemaining(0);
        setTrialEndsAt(null);
        currentUidRef.current  = null;
        currentRoleRef.current = null;
        currentOrgRef.current  = null;

        // RevenueCat logout — only if user was identified (not anonymous)
        if (!isExpoGo && Platform.OS !== "web") {
          try {
            const Purchases = (await import("react-native-purchases")).default;
            const info = await Purchases.getCustomerInfo();
            if (!info.originalAppUserId.startsWith("$RCAnonymousID")) {
              await Purchases.logOut();
            }
          } catch {}
        }
      }
      setAuthLoaded(true);
    });

    return unsubscribe;
  }, [initRevenueCat, loadMembership]);

  //////////////////////////////////////////////////////
  // REFRESH ORG PLAN WHEN APP COMES TO FOREGROUND
  //////////////////////////////////////////////////////

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state === "active") {
        // Force-refresh the ID token when app comes to foreground.
        // If the token has been revoked (e.g. password changed, account deleted),
        // getIdToken(true) will throw — we then sign the user out immediately.
        if (auth.currentUser) {
          try {
            await auth.currentUser.getIdToken(true); // throws on revoked token
            await auth.currentUser.reload();          // get fresh emailVerified
          } catch {
            await signOut(auth);
            return;
          }
        }
        if (currentOrgRef.current) {
          refreshOrgPlan();
        }
        // Refresh role in case an admin promoted/demoted this user while the app was backgrounded
        if (currentUidRef.current) {
          refreshMembership();
        }
      }
    });
    return () => sub.remove();
  }, [refreshOrgPlan, refreshMembership]);

  //////////////////////////////////////////////////////
  // ROUTE PROTECTION
  //////////////////////////////////////////////////////

  useEffect(() => {
    if (!authLoaded || (user && role === null)) return;

    const inTabs = segments[0] === "(tabs)";
    const inAuth = segments[0] === "sign-in" || segments[0] === "sign-up";

    if (!user) {
      if (inTabs) router.replace("/sign-in");
      return;
    }

    // Extra guard: if somehow an unverified user's session survived, block them
    if (!user.emailVerified) {
      if (inTabs) router.replace("/sign-in");
      return;
    }

    if (status === "pending") {
      if (inTabs) router.replace("/sign-in");
      return;
    }

    if (user && inAuth) {
      router.replace("/(tabs)/home");
    }
  }, [user, status, authLoaded, role, segments]);

  //////////////////////////////////////////////////////
  // COMPUTED VALUES
  //////////////////////////////////////////////////////

  const isPro = useMemo(() => {
    if (orgPlan === "pro" || orgPlan === "business") return true;
    if (orgPlan === "trial" && trialEndsAt && trialEndsAt > new Date()) return true;
    return false;
  }, [orgPlan, trialEndsAt]);

  const employeeLimit = useMemo(() => {
    return PLAN_LIMITS[orgPlan]?.employeeLimit ?? 5;
  }, [orgPlan]);

  const trialDaysLeft = useMemo(() => {
    if (orgPlan !== "trial" || !trialEndsAt) return 0;
    const ms   = trialEndsAt.getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  }, [orgPlan, trialEndsAt]);

  //////////////////////////////////////////////////////
  // CONTEXT VALUE
  //////////////////////////////////////////////////////

  const value = useMemo(() => ({
    user,
    role,
    status,
    orgId,
    orgPlan,
    isPro,
    aiCreditsRemaining,
    employeeLimit,
    trialEndsAt,
    trialDaysLeft,
    authLoaded,
    refreshMembership,
    refreshOrgPlan
  }), [
    user, role, status, orgId, orgPlan, isPro,
    aiCreditsRemaining, employeeLimit, trialEndsAt,
    trialDaysLeft, authLoaded, refreshMembership, refreshOrgPlan
  ]);

  //////////////////////////////////////////////////////
  // BLOCK UNTIL READY
  //////////////////////////////////////////////////////

  const roleLoaded = role !== null || !user;

  if (!authLoaded || !roleLoaded) return null;

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthProvider;
