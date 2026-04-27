import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter, useSegments } from "expo-router";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
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
import { OrgPlan, PLAN_LIMITS } from "../../constants/planLimits";
import { unsubscribeAll } from "../../utils/listenerStore";
import { auth, db } from "../firebase/firebaseConfig";
import { getIsSigningUp } from "../utils/signUpFlag";

// module-level guards — live outside the component

// expo go doesn't support native purchases
const isExpoGo = Constants.executionEnvironment === "storeClient";

// stops rc from being configured twice
let rcConfigured = false;

// throttle rc syncs to once per minute
let lastRcSync = 0;
const RC_SYNC_COOLDOWN_MS = 60_000;

// auth context shape

type AuthContextType = {
  user: User | null;
  role: "admin" | "employee" | null;
  status: "approved" | "pending" | "none" | null;
  orgId: string | null;
  orgPlan: OrgPlan;
  isPro: boolean;
  isBusiness: boolean;
  aiCreditsRemaining: number;
  employeeLimit: number;
  trialEndsAt: Date | null;
  trialDaysLeft: number;
  orgCategories: string[];
  authLoaded: boolean;
  departmentId: string | null;
  departmentName: string | null;
  refreshMembership: () => Promise<void>;
  refreshOrgPlan: () => Promise<void>;
};

// context with safe defaults

export const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  status: null,
  orgId: null,
  orgPlan: "free",
  isPro: false,
  isBusiness: false,
  aiCreditsRemaining: 0,
  employeeLimit: 5,
  trialEndsAt: null,
  trialDaysLeft: 0,
  orgCategories: [],
  authLoaded: false,
  departmentId: null,
  departmentName: null,
  refreshMembership: async () => {},
  refreshOrgPlan: async () => {}
});

export function useAuth() {
  return useContext(AuthContext);
}

// the actual provider component

export function AuthProvider({ children }: { children: React.ReactNode }) {

  const [user, setUser]     = useState<User | null>(null);
  const [role, setRole]     = useState<"admin" | "employee" | null>(null);
  const [status, setStatus] = useState<"approved" | "pending" | "none" | null>(null);
  const [orgId, setOrgId]   = useState<string | null>(null);
  const [orgPlan, setOrgPlan]                       = useState<OrgPlan>("free");
  const [aiCreditsRemaining, setAiCreditsRemaining] = useState(0);
  const [trialEndsAt, setTrialEndsAt]               = useState<Date | null>(null);
  const [orgCategories, setOrgCategories]           = useState<string[]>([]);
  const [authLoaded, setAuthLoaded]                 = useState(false);
  const [departmentId, setDepartmentId]             = useState<string | null>(null);
  const [departmentName, setDepartmentName]         = useState<string | null>(null);

  const router   = useRouter();
  const segments = useSegments();

  // refs to track current uid, role and org across re-renders
  const currentUidRef  = useRef<string | null>(null);
  const currentRoleRef = useRef<string | null>(null);
  const currentOrgRef  = useRef<string | null>(null);

  // init revenuecat once — skipped in dev and expo go

  const initRevenueCat = useCallback(async () => {
    // skip in dev builds, keys won't work and billing isn't available
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

  // syncs revenuecat entitlements to firestore — admin only

  const syncRevenueCat = useCallback(async (uid: string, oid: string) => {
    if (Platform.OS === "web" || isExpoGo || __DEV__) return;
    const now = Date.now();
    if (now - lastRcSync < RC_SYNC_COOLDOWN_MS) return;
    lastRcSync = now;
    try {
      const Purchases = (await import("react-native-purchases")).default;
      await Purchases.logIn(uid);

      // validate server-side because the client can't write plan fields directly
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      await fetch(process.env.EXPO_PUBLIC_SYNC_PLAN_URL!, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body:    JSON.stringify({ orgId: oid }),
      });
      // caller will refresh the plan after this resolves
    } catch (err) {
      console.log("RevenueCat sync error:", err);
    }
  }, []);

  // loads the org plan, credits, and categories

  const loadOrgData = useCallback(async (oid: string, memberRole: string, uid: string) => {
    const orgSnap = await getDoc(doc(db, "organisations", oid));
    const data    = orgSnap.data() || {};

    const plan       = (data.plan ?? "free") as OrgPlan;
    const trialEnd   = data.trialEndsAt?.toDate?.() ?? null;
    const credits    = data.aiCreditsRemaining ?? 0;
    const categories = Array.isArray(data.categories) && data.categories.length > 0
      ? data.categories
      : ["Meals", "Travel", "Technology", "Office"];

    setOrgPlan(plan);
    setTrialEndsAt(trialEnd);
    setAiCreditsRemaining(credits);
    setOrgCategories(categories);

    // sync rc in the background — re-read org after it resolves (admin only)
    if (memberRole === "admin") {
      syncRevenueCat(uid, oid).then(async () => {
        // re-read org doc so we pick up any plan upgrade
        const refreshed = await getDoc(doc(db, "organisations", oid));
        const d = refreshed.data() || {};
        setOrgPlan((d.plan ?? "free") as OrgPlan);
        setAiCreditsRemaining(d.aiCreditsRemaining ?? 0);
        setTrialEndsAt(d.trialEndsAt?.toDate?.() ?? null);
        setOrgCategories(
          Array.isArray(d.categories) && d.categories.length > 0
            ? d.categories
            : ["Meals", "Travel", "Technology", "Office"]
        );
      }).catch(() => {});
    }
  }, [syncRevenueCat]);

  // grabs the user's membership and loads their org

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
      setDepartmentId(membership.departmentId ?? null);
      setDepartmentName(membership.departmentName ?? null);
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

  // re-fetches org data — call this after a purchase

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

  // asks for push permission and saves the token to firestore

  async function registerPushToken(uid: string) {
    if (Platform.OS === "web" || isExpoGo) return;
    try {
      // android needs a channel before it can show anything
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Default",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#0066FF",
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") return; // nothing we can do without permission

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) return;

      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

      // write the token to the user doc (merge keeps everything else intact)
      await setDoc(doc(db, "users", uid), { expoPushToken: token }, { merge: true });
    } catch {
      // push is optional, don't crash the app over it
    }
  }

  // fires whenever firebase auth changes

  useEffect(() => {
    initRevenueCat();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // reload + get a fresh token so firestore rules see the latest verified state
        try {
          await firebaseUser.reload();
          await firebaseUser.getIdToken(true); // refresh the jwt so it has current claims
        } catch {}

        // kick out unverified users, but let sign-up finish writing before we boot them
        if (!firebaseUser.emailVerified && !getIsSigningUp()) {
          await signOut(auth);
          setAuthLoaded(true);
          return;
        }

        setUser(firebaseUser);
        currentUidRef.current = firebaseUser.uid;

        if (firebaseUser.emailVerified) {
          // only load membership for verified users (prevents a firestore permission error)
          await loadMembership(firebaseUser.uid);
          // sign them up for push while we're here
          registerPushToken(firebaseUser.uid).catch(() => {});
        } else {
          // mid sign-up, skip the membership fetch for now
          setRole("employee");
          setStatus("none");
        }
      } else {
        unsubscribeAll();
        setUser(null);
        setRole(null);
        setStatus(null);
        setOrgId(null);
        setOrgPlan("free");
        setAiCreditsRemaining(0);
        setTrialEndsAt(null);
        setOrgCategories([]);
        setDepartmentId(null);
        setDepartmentName(null);
        currentUidRef.current  = null;
        currentRoleRef.current = null;
        currentOrgRef.current  = null;

        // log out of rc but only if they were actually identified (not anon)
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

  // re-checks the plan whenever the app comes back into view

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state === "active") {
        // force a token refresh — if it throws the account is gone so we sign them out
        if (auth.currentUser) {
          try {
            await auth.currentUser.getIdToken(true); // blows up if the account got deleted
            await auth.currentUser.reload();          // pick up any profile changes
          } catch {
            await signOut(auth);
            return;
          }
        }
        if (currentOrgRef.current) {
          refreshOrgPlan();
        }
        // also refresh membership in case the admin changed their role while backgrounded
        if (currentUidRef.current) {
          refreshMembership();
        }
      }
    });
    return () => sub.remove();
  }, [refreshOrgPlan, refreshMembership]);

  // keeps users on the right screens based on their auth state

  useEffect(() => {
    if (!authLoaded || (user && role === null)) return;

    const inTabs       = segments[0] === "(tabs)";
    const inAuth       = segments[0] === "sign-in" || segments[0] === "sign-up";
    const inOnboarding = segments[0] === "social-onboarding";

    if (!user) {
      if (inTabs || inOnboarding) router.replace("/sign-in");
      return;
    }

    // just in case an unverified session slipped through
    if (!user.emailVerified) {
      if (inTabs || inOnboarding) router.replace("/sign-in");
      return;
    }

    if (status === "pending") {
      if (inTabs || inOnboarding) router.replace("/sign-in");
      return;
    }

    // logged in but no org yet — they need to set one up first
    if (status === "none") {
      if (inTabs || inAuth) router.replace("/social-onboarding");
      return; // stay on onboarding if already there
    }

    // all good — get them into the app
    if (inAuth || inOnboarding) {
      router.replace("/(tabs)/home");
    }
  }, [user, status, authLoaded, role, segments]);

  // derived values from the raw state

  const isPro = useMemo(() => {
    if (orgPlan === "pro" || orgPlan === "business") return true;
    if (orgPlan === "trial" && trialEndsAt && trialEndsAt > new Date()) return true;
    return false;
  }, [orgPlan, trialEndsAt]);

  // trial counts as business for feature access
  const isBusiness = useMemo(() => {
    if (orgPlan === "business") return true;
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

  // package everything up for the context

  const value = useMemo(() => ({
    user,
    role,
    status,
    orgId,
    orgPlan,
    isPro,
    isBusiness,
    aiCreditsRemaining,
    employeeLimit,
    trialEndsAt,
    trialDaysLeft,
    orgCategories,
    authLoaded,
    departmentId,
    departmentName,
    refreshMembership,
    refreshOrgPlan
  }), [
    user, role, status, orgId, orgPlan, isPro, isBusiness,
    aiCreditsRemaining, employeeLimit, trialEndsAt,
    trialDaysLeft, orgCategories, authLoaded, departmentId, departmentName,
    refreshMembership, refreshOrgPlan
  ]);

  // don't render until we know who the user is

  const roleLoaded = role !== null || !user;

  if (!authLoaded || !roleLoaded) return null;

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthProvider;
