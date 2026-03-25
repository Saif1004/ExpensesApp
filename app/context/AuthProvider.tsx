import { useRouter, useSegments } from "expo-router";
import { onAuthStateChanged, User } from "firebase/auth";
import Constants from "expo-constants";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
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
    if (rcConfigured || Platform.OS === "web" || isExpoGo) return;
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
    if (Platform.OS === "web" || isExpoGo) return;
    const now = Date.now();
    if (now - lastRcSync < RC_SYNC_COOLDOWN_MS) return;
    lastRcSync = now;
    try {
      const Purchases = (await import("react-native-purchases")).default;
      await Purchases.logIn(uid);
      const info = await Purchases.getCustomerInfo();

      // Check separate pro and business entitlements
      const hasBusiness = !!info.entitlements.active[PLAN_LIMITS.business.rcEntitlement!];
      const hasPro      = !!info.entitlements.active[PLAN_LIMITS.pro.rcEntitlement!];
      const rcPlan: OrgPlan = hasBusiness ? "business" : hasPro ? "pro" : "free";

      // Only write to Firestore if plan changed — don't overwrite an active trial with "free"
      const orgSnap = await getDoc(doc(db, "organisations", oid));
      const currentPlan = (orgSnap.data()?.plan ?? "free") as OrgPlan;

      const shouldUpdate =
        rcPlan !== currentPlan &&
        // Don't downgrade an active trial — let it expire naturally
        !(rcPlan === "free" && (currentPlan === "trial" || currentPlan === "free"));

      if (shouldUpdate) {
        const updates: Record<string, unknown> = { plan: rcPlan };
        if (rcPlan === "pro" || rcPlan === "business") {
          updates.aiCreditsRemaining = PLAN_LIMITS[rcPlan].aiCreditsPerPeriod;
          updates.aiCreditsResetAt   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }
        await updateDoc(doc(db, "organisations", oid), updates);
      }
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

    // Admin: sync RevenueCat → Firestore
    if (memberRole === "admin") {
      syncRevenueCat(uid, oid);
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
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && currentOrgRef.current) {
        refreshOrgPlan();
      }
    });
    return () => sub.remove();
  }, [refreshOrgPlan]);

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
