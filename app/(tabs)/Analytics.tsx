import React, { useEffect, useMemo, useState } from "react";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where
} from "firebase/firestore";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import {
  BarChart,
  PieChart
} from "react-native-chart-kit";

import { useRouter } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { Ionicons } from "@expo/vector-icons";
import PaywallScreen from "../../components/paywall-screen";
import { ThemedText } from "../../components/themed-text";
import { useTheme } from "../../hooks/useTheme";
import { addListener } from "../../utils/listenerStore";
import { useAuth } from "../context/AuthProvider";
import { db } from "../firebase/firebaseConfig";

const screenWidth = Dimensions.get("window").width;
const AI_URL = process.env.EXPO_PUBLIC_ANALYTICS_AI_URL!;

const CATEGORY_COLOURS = [
  "#0066FF", "#22C55E", "#F59E0B", "#F97316",
  "#EF4444", "#06B6D4", "#0EA5E9", "#EC4899",
  "#14B8A6", "#84CC16"
];

type Period   = "month" | "quarter" | "year" | "tax_year" | "all";
type Scope    = "mine" | "org";
type NavTab   = "summary" | "charts" | "breakdown" | "forecast";

const PERIOD_LABELS: Record<Period, string> = {
  month:    "This Month",
  quarter:  "This Quarter",
  year:     "This Year",
  tax_year: "Tax Year",
  all:      "All Time"
};

const NAV_TABS: { key: NavTab; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { key: "summary",   label: "Summary",   icon: "stats-chart-outline" },
  { key: "charts",    label: "Charts",    icon: "bar-chart-outline" },
  { key: "breakdown", label: "Breakdown", icon: "list-outline" },
  { key: "forecast",  label: "Forecast",  icon: "trending-up-outline" },
];

type Claim = {
  id: string;
  amount: number;
  category: string;
  status: "pending" | "approved" | "rejected";
  suspicious?: boolean;
  merchant?: string;
  paymentStatus?: string;
  purchaseDate?: string;
  createdAt?: { toDate: () => Date };
  departmentName?: string;
};

function formatDate(c: Claim): string {
  if (c.purchaseDate) {
    try { return new Date(c.purchaseDate).toLocaleDateString("en-GB"); } catch { return c.purchaseDate; }
  }
  return "—";
}

function submittedDate(c: Claim): string {
  try { return c.createdAt?.toDate().toLocaleDateString("en-GB") ?? "—"; } catch { return "—"; }
}

function taxYearStart(): Date {
  const now = new Date();
  const year =
    now.getMonth() < 3 || (now.getMonth() === 3 && now.getDate() < 6)
      ? now.getFullYear() - 1
      : now.getFullYear();
  return new Date(year, 3, 6);
}

function filterByPeriod(claims: Claim[], period: Period): Claim[] {
  if (period === "all") return claims;
  const now = new Date();
  let from: Date;
  if (period === "month")    from = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (period === "quarter") { const q = Math.floor(now.getMonth() / 3); from = new Date(now.getFullYear(), q * 3, 1); }
  else if (period === "year") from = new Date(now.getFullYear(), 0, 1);
  else                        from = taxYearStart();
  return claims.filter(c => {
    const d = c.purchaseDate ? new Date(c.purchaseDate) : c.createdAt?.toDate();
    return d && d >= from;
  });
}

export default function AnalyticsScreen() {
  const { user, role, isPro, isBusiness, orgId, orgCategories } = useAuth();
  const router   = useRouter();
  const posthog  = usePostHog();
  const { tokens: t, mode } = useTheme();
  const isDark   = mode === "dark";

  const [loading, setLoading]           = useState(true);
  const [aiLoading, setAiLoading]       = useState(false);
  const [aiInsight, setAiInsight]       = useState("");
  const [period, setPeriod]             = useState<Period>("month");
  const [scope, setScope]               = useState<Scope>("mine");
  const [navTab, setNavTab]             = useState<NavTab>("summary");
  const [allClaims, setAllClaims]       = useState<Claim[]>([]);
  const [accountCodes, setAccountCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user || !user.emailVerified) return;
    const q =
      scope === "org" && role === "admin" && orgId
        ? query(collection(db, "claims"), where("orgId", "==", orgId))
        : query(collection(db, "claims"), where("userId", "==", user.uid));
    setLoading(true);
    const unsub = addListener(onSnapshot(q, snap => {
      setAllClaims(snap.docs.map(d => ({ id: d.id, ...d.data() } as Claim)));
      setLoading(false);
    }, () => {}));
    return unsub;
  }, [user, role, orgId, scope]);

  useEffect(() => {
    if (!orgId) return;
    getDoc(doc(db, "organisations", orgId)).then(snap => {
      if (snap.exists()) setAccountCodes(snap.data().categoryAccountCodes ?? {});
    }).catch(() => {});
  }, [orgId]);

  const claims = useMemo(() => filterByPeriod(allClaims, period), [allClaims, period]);

  const stats = useMemo(() => {
    let totalSpend = 0, approvedSpend = 0, pendingSpend = 0;
    let approved = 0, pending = 0, rejected = 0, suspicious = 0;
    const categoryCount: Record<string, number> = {};
    const categorySpend: Record<string, number> = {};
    const merchantSpend: Record<string, number> = {};
    const monthly: Record<string, number> = {};

    claims.forEach(c => {
      const amt = Number(c.amount) || 0;
      totalSpend += amt;
      if (c.status === "approved") { approved++; approvedSpend += amt; }
      if (c.status === "pending")  { pending++;  pendingSpend  += amt; }
      if (c.status === "rejected") rejected++;
      if (c.suspicious)            suspicious++;
      const cat = c.category || "Other";
      categoryCount[cat] = (categoryCount[cat] ?? 0) + 1;
      categorySpend[cat] = (categorySpend[cat] ?? 0) + amt;
      const m = c.merchant?.trim();
      if (m) merchantSpend[m] = (merchantSpend[m] ?? 0) + amt;
      const d = c.purchaseDate ? new Date(c.purchaseDate) : c.createdAt?.toDate();
      if (d) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthly[key] = (monthly[key] ?? 0) + amt;
      }
    });

    const total = claims.length;
    const avgValue    = total > 0 ? totalSpend / total : 0;
    const approvalRate = total > 0 ? ((approved / total) * 100).toFixed(1) : "0";
    const topMerchants = Object.entries(merchantSpend).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const now = new Date();
    const last6 = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return { label: d.toLocaleString("default", { month: "short" }), value: monthly[key] ?? 0 };
    });

    return { total, totalSpend, approvedSpend, pendingSpend, approved, pending, rejected, suspicious, avgValue, approvalRate, categoryCount, categorySpend, topMerchants, monthlyData: last6 };
  }, [claims]);

  const cats = orgCategories.length > 0 ? orgCategories : ["Meals", "Travel", "Technology", "Office"];

  const categoryPieData = useMemo(() =>
    cats.filter(cat => (stats.categoryCount[cat] ?? 0) > 0)
        .map((cat, i) => ({
          name: cat, population: stats.categoryCount[cat] ?? 0,
          color: CATEGORY_COLOURS[i % CATEGORY_COLOURS.length],
          legendFontColor: t.text, legendFontSize: 11
        })),
    [stats.categoryCount, cats, t]
  );

  const forecast = useMemo(() => {
    if (allClaims.length === 0) return null;
    const now = new Date();
    const tyStartYear = now.getMonth() < 3 || (now.getMonth() === 3 && now.getDate() < 6) ? now.getFullYear() - 1 : now.getFullYear();
    const tyStart     = new Date(tyStartYear, 3, 6);
    const tyEnd       = new Date(tyStartYear + 1, 3, 5);
    const daysInYear  = Math.round((tyEnd.getTime() - tyStart.getTime()) / 86400000);
    const daysElapsed = Math.max(1, Math.round((now.getTime() - tyStart.getTime()) / 86400000));
    const daysRemaining = Math.max(0, daysInYear - daysElapsed);
    const completionPct = (daysElapsed / daysInYear) * 100;
    const tySpend = allClaims.filter(c => { const d = c.purchaseDate ? new Date(c.purchaseDate) : c.createdAt?.toDate(); return d && d >= tyStart; }).reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const dailyBurn = tySpend / daysElapsed;
    const projectedYearEnd = dailyBurn * daysInYear;
    const projectedRemaining = dailyBurn * daysRemaining;
    const monthly: Record<string, number> = {};
    allClaims.forEach(c => { const d = c.purchaseDate ? new Date(c.purchaseDate) : c.createdAt?.toDate(); if (d) { const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; monthly[key] = (monthly[key] ?? 0) + (Number(c.amount) || 0); } });
    const monthKey = (off: number) => { const d = new Date(now.getFullYear(), now.getMonth() - off, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
    const last3Avg = ([1,2,3].reduce((s, i) => s + (monthly[monthKey(i)] ?? 0), 0)) / 3;
    const prev3Avg = ([4,5,6].reduce((s, i) => s + (monthly[monthKey(i)] ?? 0), 0)) / 3;
    const trendPct = prev3Avg > 0 ? ((last3Avg - prev3Avg) / prev3Avg) * 100 : 0;
    const catProjections = cats.map(cat => {
      const current = allClaims.filter(c => { const d = c.purchaseDate ? new Date(c.purchaseDate) : c.createdAt?.toDate(); return c.category === cat && d && d >= tyStart; }).reduce((s, c) => s + (Number(c.amount) || 0), 0);
      return { cat, current, projected: dailyBurn > 0 ? (current / tySpend) * projectedYearEnd : 0 };
    }).filter(cp => cp.current > 0);
    return { tyStartYear, daysElapsed, daysRemaining, daysInYear, completionPct, tySpend, dailyBurn, projectedYearEnd, projectedRemaining, trendPct, nextMonthForecast: last3Avg, catProjections };
  }, [allClaims, cats]);

  const deptBreakdown = useMemo(() => {
    if (scope !== "org") return [];
    const map: Record<string, number> = {};
    claims.forEach(c => { const key = c.departmentName || "Unassigned"; map[key] = (map[key] || 0) + c.amount; });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return Object.entries(map).map(([name, amount]) => ({ name, amount, pct: total > 0 ? (amount / total) * 100 : 0 })).sort((a, b) => b.amount - a.amount);
  }, [claims, scope]);

  async function generateAIInsights() {
    posthog.capture("ai_insights_generated", { period, scope });
    try {
      setAiLoading(true);
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch(AI_URL, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ stats: { ...stats, period } }) });
      const result = await res.json();
      setAiInsight(result?.error ? result.error : (result?.insight ?? ""));
    } catch { setAiInsight("Failed to generate insights."); }
    finally { setAiLoading(false); }
  }

  // ── Export helpers ──────────────────────────────────────────────────────────
  async function getExportClaims(): Promise<Claim[]> {
    if (!user) return [];
    const q = scope === "org" && role === "admin" && orgId ? query(collection(db, "claims"), where("orgId", "==", orgId)) : query(collection(db, "claims"), where("userId", "==", user.uid));
    const snap = await getDocs(q);
    return filterByPeriod(snap.docs.map(d => ({ id: d.id, ...d.data() } as Claim)), period);
  }
  function rowData(cs: Claim[]) {
    return cs.map(c => ({ claimRef: c.id ? c.id.slice(0, 8).toUpperCase() : "—", employee: (c as any).userEmail ?? "—", merchant: c.merchant ?? "—", amount: Number(c.amount).toFixed(2), category: c.category ?? "—", status: c.status ?? "—", paymentStatus: c.paymentStatus ?? "—", approvedBy: (c as any).approvedBy ?? "—", notes: (c as any).adminFeedback ?? (c as any).description ?? "—", purchaseDate: formatDate(c), submittedDate: submittedDate(c) }));
  }
  const DEFAULT_ACCOUNT_CODES: Record<string, string> = { "Meals": "420", "Travel": "493", "Technology": "404", "Office": "429" };
  function getAccountCode(cat: string) { return accountCodes[cat] ?? DEFAULT_ACCOUNT_CODES[cat] ?? "429"; }
  function rowToCSV(r: ReturnType<typeof rowData>[0]) { return [r.claimRef, r.employee, r.merchant, r.amount, r.category, r.status, r.paymentStatus, r.approvedBy, r.notes, r.purchaseDate, r.submittedDate].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","); }
  function rowToXero(r: ReturnType<typeof rowData>[0]) { return [r.purchaseDate, r.amount, r.merchant, r.category, r.claimRef, getAccountCode(r.category), "20% (VAT on Expenses)", "GBP"].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","); }
  function rowToQBO(r: ReturnType<typeof rowData>[0]) { return [r.purchaseDate, r.amount, r.category, getAccountCode(r.category), r.merchant, r.claimRef, r.notes].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","); }
  function rowToSage(r: ReturnType<typeof rowData>[0]) { return [r.purchaseDate, r.claimRef, `${r.category} - ${r.merchant}`, r.amount, "T1", getAccountCode(r.category), ""].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","); }

  function requireBusiness() {
    if (!isBusiness) { Alert.alert("Business Plan Required", "Accounting exports (Xero, QuickBooks, Sage) require the Business plan.", [{ text: "Not Now", style: "cancel" }, { text: "Upgrade", onPress: () => {} }]); return false; }
    return true;
  }

  async function runExport(format: string, getRows: (cs: Claim[]) => string[], header: string, filename: string, mime: string, dialogTitle: string) {
    posthog.capture("analytics_export_triggered", { format, period, scope });
    try {
      const cs = await getExportClaims();
      const data = format === "pdf" ? null : header + getRows(cs).join("\n");
      if (data !== null) {
        const uri = (FileSystem.documentDirectory ?? "") + filename;
        await FileSystem.writeAsStringAsync(uri, data, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle });
        else Alert.alert("Saved", uri);
      }
    } catch (e: any) { Alert.alert("Export Error", e?.message ?? "Failed to export."); }
  }

  async function exportCSV()  { runExport("csv",  rows => rowData(rows).map(rowToCSV),  "Reference,Employee,Merchant,Amount (£),Category,Status,Payment Status,Approved By,Notes,Purchase Date,Submitted Date\n",  "claims_export.csv",  "text/csv",  "Export CSV"); }
  async function exportPDF()  {
    posthog.capture("analytics_export_triggered", { format: "pdf", period, scope });
    try {
      const cs   = await getExportClaims();
      const rows = rowData(cs);
      const grand = rows.reduce((s, r) => s + parseFloat(r.amount), 0).toFixed(2);
      const trs = rows.map(r => `<tr><td>${r.claimRef}</td><td>${r.employee}</td><td>${r.merchant}</td><td>£${r.amount}</td><td>${r.category}</td><td class="s-${r.status}">${r.status}</td><td>${r.paymentStatus}</td><td>${r.approvedBy}</td><td>${r.notes}</td><td>${r.purchaseDate}</td></tr>`).join("");
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>body{font-family:-apple-system,Helvetica,Arial,sans-serif;margin:28px;color:#0D1B2A;font-size:10px}h1{font-size:20px;margin-bottom:4px}.meta{color:#6B7A8D;margin:0 0 20px;font-size:10px}table{width:100%;border-collapse:collapse}th{background:#6366F1;color:#fff;padding:6px 7px;text-align:left;font-size:9px}td{padding:5px 7px;border-bottom:1px solid #E8ECF0;font-size:9px}tr:nth-child(even) td{background:#F8F9FC}.s-approved{color:#16a34a;font-weight:600}.s-rejected{color:#dc2626;font-weight:600}.total{text-align:right;margin-top:14px;font-weight:700;font-size:12px}.footer{margin-top:28px;color:#A0ACBB;font-size:9px;border-top:1px solid #E8ECF0;padding-top:10px}</style></head><body><h1>Claimio — Expense Report</h1><p class="meta">Period: ${PERIOD_LABELS[period]} · Generated: ${new Date().toLocaleDateString("en-GB")} · ${rows.length} claims</p><table><thead><tr><th>Ref</th><th>Employee</th><th>Merchant</th><th>Amount</th><th>Category</th><th>Status</th><th>Payment</th><th>Approved By</th><th>Notes</th><th>Date</th></tr></thead><tbody>${trs}</tbody></table><p class="total">Total: £${grand}</p><p class="footer">Generated by Claimio.</p></body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Export PDF" });
      else Alert.alert("Saved", uri);
    } catch (e: any) { Alert.alert("Export Error", e?.message ?? "Failed."); }
  }
  async function exportXero() {
    if (!requireBusiness()) return;
    posthog.capture("analytics_export_triggered", { format: "xero", period, scope });
    try {
      const cs = (await getExportClaims()).filter(c => c.status === "approved");
      if (!cs.length) { Alert.alert("No approved claims", "Xero export only includes approved claims."); return; }
      const uri = (FileSystem.documentDirectory ?? "") + "xero_import.csv";
      await FileSystem.writeAsStringAsync(uri, "Date,Amount,Payee,Description,Reference,Account Code,Tax Rate,Currency\n" + rowData(cs).map(rowToXero).join("\n"), { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Export for Xero" });
      else Alert.alert("Saved", uri);
    } catch (e: any) { Alert.alert("Export Error", e?.message ?? "Failed."); }
  }
  async function exportQBO() {
    if (!requireBusiness()) return;
    posthog.capture("analytics_export_triggered", { format: "qbo", period, scope });
    try {
      const cs = (await getExportClaims()).filter(c => c.status === "approved");
      if (!cs.length) { Alert.alert("No approved claims", "QuickBooks export only includes approved claims."); return; }
      const uri = (FileSystem.documentDirectory ?? "") + "quickbooks_import.csv";
      await FileSystem.writeAsStringAsync(uri, "Date,Amount,Description,Account,Payee,Ref No.,Memo\n" + rowData(cs).map(rowToQBO).join("\n"), { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Export for QuickBooks" });
      else Alert.alert("Saved", uri);
    } catch (e: any) { Alert.alert("Export Error", e?.message ?? "Failed."); }
  }
  async function exportSage() {
    if (!requireBusiness()) return;
    posthog.capture("analytics_export_triggered", { format: "sage", period, scope });
    try {
      const cs = (await getExportClaims()).filter(c => c.status === "approved");
      if (!cs.length) { Alert.alert("No approved claims", "Sage export only includes approved claims."); return; }
      const uri = (FileSystem.documentDirectory ?? "") + "sage_import.csv";
      await FileSystem.writeAsStringAsync(uri, "Date,Reference,Description,Net,Tax Code,Account Ref,Department\n" + rowData(cs).map(rowToSage).join("\n"), { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Export for Sage" });
      else Alert.alert("Saved", uri);
    } catch (e: any) { Alert.alert("Export Error", e?.message ?? "Failed."); }
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  const { chartConfig, styles } = useMemo(() => {
    const shadow = isDark ? {} : { shadowColor: "#000" as string, shadowOffset: { width: 0, height: 2 } as any, shadowOpacity: 0.07 as number, shadowRadius: 10 as number, elevation: 3 as number };
    const cfg = { backgroundGradientFrom: t.surface, backgroundGradientTo: t.surface, fillShadowGradient: t.accent, fillShadowGradientOpacity: 1, decimalPlaces: 0, color: () => t.accent, labelColor: () => t.textSecondary, propsForBackgroundLines: { stroke: t.border, strokeDasharray: "" } };
    const st = StyleSheet.create({
      container:       { flex: 1, backgroundColor: t.bg },
      header:          { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
      title:           { fontSize: 26, fontWeight: "800", color: t.text, letterSpacing: -0.8 },
      subtitle:        { color: t.textSecondary, fontSize: 13, marginTop: 2 },

      // scope & period controls
      controlsWrap:    { paddingHorizontal: 20, paddingBottom: 6 },
      scopeRow:        { flexDirection: "row", backgroundColor: t.surface, borderRadius: 999, padding: 4, marginTop: 12, marginBottom: 10, ...shadow },
      scopeBtn:        { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 999 },
      scopeBtnActive:  { backgroundColor: t.accent },
      scopeText:       { fontSize: 13, fontWeight: "600", color: t.textSecondary },
      scopeTextActive: { color: "#FFFFFF" },
      periodScroll:    { marginBottom: 4 },
      periodContent:   { gap: 8, paddingRight: 8 },
      pill:            { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: t.surface },
      pillActive:      { backgroundColor: t.accent },
      pillText:        { color: t.textSecondary, fontSize: 12, fontWeight: "600" },
      pillTextActive:  { color: "#FFFFFF", fontWeight: "700" },

      // nav tab bar
      navBar:          { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border, backgroundColor: t.surface },
      navTab:          { flex: 1, paddingVertical: 11, alignItems: "center", gap: 3 },
      navTabActive:    { borderBottomWidth: 2, borderBottomColor: t.accent },
      navTabText:      { fontSize: 11, fontWeight: "600", color: t.textTertiary },
      navTabTextActive:{ color: t.accent },

      // content
      inner:           { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 60 },

      // cards
      grid:            { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16, marginBottom: 4 },
      card:            { width: "47%", backgroundColor: t.surface, padding: 16, borderRadius: 18, ...shadow },
      cardFull:        { width: "100%", backgroundColor: t.surface, padding: 16, borderRadius: 18, marginTop: 10, ...shadow },
      cardLabel:       { color: t.textSecondary, fontSize: 11, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
      cardValue:       { fontSize: 22, fontWeight: "800", color: t.text, letterSpacing: -0.5 },
      cardValueSm:     { fontSize: 18, fontWeight: "700", color: t.text, letterSpacing: -0.3 },

      // section titles
      sectionTitle:    { fontSize: 14, fontWeight: "700", color: t.textSecondary, marginTop: 20, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6 },

      // ai
      aiCard:          { backgroundColor: t.surface, padding: 18, borderRadius: 18, marginTop: 10, ...shadow },
      aiTitle:         { color: t.text, fontWeight: "700", marginBottom: 6, fontSize: 14 },
      aiText:          { color: t.textSecondary, lineHeight: 20, fontSize: 13 },
      aiBtn:           { backgroundColor: t.accent, padding: 13, borderRadius: 999, marginTop: 12, alignItems: "center" },

      // export
      exportGrid:      { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
      exportBtn:       { backgroundColor: t.surface, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 10, alignItems: "center", minWidth: "30%", flex: 1, ...shadow },
      exportBtnText:   { color: t.textSecondary, fontWeight: "700", fontSize: 12, marginTop: 4 },
      exportBtnSub:    { color: t.textTertiary, fontSize: 10, marginTop: 2 },

      // charts
      chart:           { borderRadius: 16 },
      chartCard:       { backgroundColor: t.surface, borderRadius: 18, padding: 14, marginTop: 10, ...shadow },

      // breakdown rows
      catRow:          { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.border },
      catDot:          { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
      catName:         { color: t.text, fontSize: 13, flex: 1 },
      catCount:        { color: t.textSecondary, fontSize: 12, marginRight: 12 },
      catAmt:          { color: t.text, fontSize: 13, fontWeight: "700", minWidth: 70, textAlign: "right" },
      merchantRow:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.border },
      merchantName:    { color: t.text, fontSize: 13, fontWeight: "500", flex: 1 },
      merchantAmt:     { color: t.text, fontSize: 13, fontWeight: "800" },
      emptyNote:       { color: t.textSecondary, fontSize: 13, textAlign: "center", marginTop: 8, marginBottom: 4 },

      // forecast
      forecastCard:    { backgroundColor: t.surface, borderRadius: 18, padding: 16, marginTop: 10, ...shadow },
      forecastHighlight: { backgroundColor: t.accentSurface },
      forecastCardTitle: { color: t.text, fontWeight: "700", fontSize: 14, marginBottom: 2 },
      forecastCardSub:   { color: t.textSecondary, fontSize: 12 },
      forecastNote:      { color: t.textSecondary, fontSize: 10, marginTop: 2 },
      progressTrack:   { height: 6, backgroundColor: t.border, borderRadius: 999, marginTop: 10, overflow: "hidden" },
      progressFill:    { height: 6, backgroundColor: t.accent, borderRadius: 999 },
      trendIconWrap:   { width: 40, height: 40, borderRadius: 999, justifyContent: "center", alignItems: "center" },

      center:          { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 60 },
    });
    return { chartConfig: cfg, styles: st };
  }, [t, isDark]);

  // ── Early returns (after all hooks) ─────────────────────────────────────────
  if (!isPro) return <PaywallScreen />;
  if (loading) return <View style={[styles.container, styles.center]}><ActivityIndicator size="large" color={t.accent} /></View>;

  // ── Tab content ─────────────────────────────────────────────────────────────

  const SummaryTab = (
    <ScrollView contentContainerStyle={[styles.inner, { paddingTop: 4 }]} showsVerticalScrollIndicator={false}>
      {/* KPI cards */}
      <View style={styles.grid}>
        <View style={styles.card}>
          <ThemedText style={styles.cardLabel}>Total Spend</ThemedText>
          <ThemedText style={styles.cardValue}>£{stats.totalSpend.toFixed(2)}</ThemedText>
        </View>
        <View style={styles.card}>
          <ThemedText style={styles.cardLabel}>Approval Rate</ThemedText>
          <ThemedText style={styles.cardValue}>{stats.approvalRate}%</ThemedText>
        </View>
        <View style={styles.card}>
          <ThemedText style={styles.cardLabel}>Approved</ThemedText>
          <ThemedText style={[styles.cardValue, { color: t.success }]}>£{stats.approvedSpend.toFixed(2)}</ThemedText>
        </View>
        <View style={styles.card}>
          <ThemedText style={styles.cardLabel}>Pending</ThemedText>
          <ThemedText style={[styles.cardValue, { color: t.warning }]}>£{stats.pendingSpend.toFixed(2)}</ThemedText>
        </View>
        <View style={styles.card}>
          <ThemedText style={styles.cardLabel}>Avg Claim</ThemedText>
          <ThemedText style={styles.cardValueSm}>£{stats.avgValue.toFixed(2)}</ThemedText>
        </View>
        <View style={styles.card}>
          <ThemedText style={styles.cardLabel}>Flagged</ThemedText>
          <ThemedText style={[styles.cardValue, { color: stats.suspicious > 0 ? t.warning : t.success }]}>{stats.suspicious}</ThemedText>
        </View>
      </View>

      {/* status count card */}
      <View style={styles.cardFull}>
        <ThemedText style={styles.cardLabel}>Claim Status</ThemedText>
        <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 8 }}>
          {[{ label: "Approved", value: stats.approved, color: t.success }, { label: "Pending", value: stats.pending, color: t.warning }, { label: "Rejected", value: stats.rejected, color: t.error }].map(s => (
            <View key={s.label} style={{ alignItems: "center" }}>
              <ThemedText style={{ fontSize: 24, fontWeight: "800", color: s.color }}>{s.value}</ThemedText>
              <ThemedText style={{ color: t.textSecondary, fontSize: 12 }}>{s.label}</ThemedText>
            </View>
          ))}
        </View>
      </View>

      {/* AI Insights */}
      <ThemedText style={styles.sectionTitle}>AI Insights</ThemedText>
      <View style={styles.aiCard}>
        <ThemedText style={styles.aiTitle}>✦ Spending Analysis</ThemedText>
        {aiLoading
          ? <ActivityIndicator color={t.accent} />
          : <ThemedText style={styles.aiText}>{aiInsight || "Tap below to generate spending insights for this period."}</ThemedText>
        }
        <TouchableOpacity style={styles.aiBtn} onPress={generateAIInsights}>
          <ThemedText style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Generate Insights</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Exports */}
      <ThemedText style={styles.sectionTitle}>Export</ThemedText>
      <View style={styles.exportGrid}>
        {[
          { label: "CSV",    icon: "document-text-outline" as const,  onPress: exportCSV,   sub: "All claims",    color: t.accent },
          { label: "PDF",    icon: "print-outline" as const,           onPress: exportPDF,   sub: "All claims",    color: t.accent },
          { label: "Xero",   icon: "cloud-upload-outline" as const,    onPress: exportXero,  sub: "Approved only", color: "#00B5A3", lock: !isBusiness },
          { label: "QBO",    icon: "logo-usd" as const,                onPress: exportQBO,   sub: "Approved only", color: "#2CA01C", lock: !isBusiness },
          { label: "Sage",   icon: "briefcase-outline" as const,       onPress: exportSage,  sub: "Approved only", color: "#00DC82", lock: !isBusiness },
        ].map(btn => (
          <TouchableOpacity key={btn.label} style={styles.exportBtn} onPress={btn.onPress} activeOpacity={0.75}>
            <View style={{ position: "relative" }}>
              <Ionicons name={btn.icon} size={22} color={btn.color} />
              {btn.lock && <Ionicons name="lock-closed" size={10} color={btn.color} style={{ position: "absolute", bottom: -2, right: -6 }} />}
            </View>
            <ThemedText style={[styles.exportBtnText, { color: btn.color }]}>{btn.label}</ThemedText>
            <ThemedText style={styles.exportBtnSub}>{btn.sub}</ThemedText>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  const ChartsTab = (
    <ScrollView contentContainerStyle={[styles.inner, { paddingTop: 4 }]} showsVerticalScrollIndicator={false}>
      <ThemedText style={styles.sectionTitle}>Monthly Spend</ThemedText>
      <View style={styles.chartCard}>
        <BarChart data={{ labels: stats.monthlyData.map(m => m.label), datasets: [{ data: stats.monthlyData.map(m => m.value) }] }} width={screenWidth - 68} height={190} chartConfig={chartConfig} fromZero showValuesOnTopOfBars yAxisLabel="£" yAxisSuffix="" style={styles.chart} />
      </View>

      <ThemedText style={styles.sectionTitle}>Claim Status</ThemedText>
      <View style={styles.chartCard}>
        <BarChart data={{ labels: ["Approved", "Pending", "Rejected"], datasets: [{ data: [stats.approved, stats.pending, stats.rejected] }] }} width={screenWidth - 68} height={180} chartConfig={chartConfig} fromZero showValuesOnTopOfBars yAxisLabel="" yAxisSuffix="" style={styles.chart} />
      </View>

      <ThemedText style={styles.sectionTitle}>Claims by Category</ThemedText>
      <View style={styles.chartCard}>
        {categoryPieData.length > 0
          ? <PieChart data={categoryPieData} width={screenWidth - 68} height={190} chartConfig={chartConfig} accessor="population" backgroundColor="transparent" paddingLeft="10" />
          : <ThemedText style={styles.emptyNote}>No claims in this period.</ThemedText>
        }
      </View>
    </ScrollView>
  );

  const BreakdownTab = (
    <ScrollView contentContainerStyle={[styles.inner, { paddingTop: 4 }]} showsVerticalScrollIndicator={false}>
      <ThemedText style={styles.sectionTitle}>Spend by Category</ThemedText>
      {cats.filter(cat => (stats.categoryCount[cat] ?? 0) > 0).length > 0
        ? cats.filter(cat => (stats.categoryCount[cat] ?? 0) > 0).map((cat, i) => (
            <View key={cat} style={styles.catRow}>
              <View style={[styles.catDot, { backgroundColor: CATEGORY_COLOURS[i % CATEGORY_COLOURS.length] }]} />
              <ThemedText style={styles.catName}>{cat}</ThemedText>
              <ThemedText style={styles.catCount}>{stats.categoryCount[cat]} claim{stats.categoryCount[cat] !== 1 ? "s" : ""}</ThemedText>
              <ThemedText style={styles.catAmt}>£{(stats.categorySpend[cat] ?? 0).toFixed(2)}</ThemedText>
            </View>
          ))
        : <ThemedText style={styles.emptyNote}>No claims in this period.</ThemedText>
      }

      {scope === "org" && (
        <>
          <ThemedText style={styles.sectionTitle}>Spend by Department</ThemedText>
          {isBusiness ? (
            deptBreakdown.length > 0
              ? deptBreakdown.map((item, index) => (
                  <View key={item.name} style={{ marginBottom: 2 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, marginRight: 8, backgroundColor: CATEGORY_COLOURS[index % CATEGORY_COLOURS.length] }} />
                        <ThemedText style={styles.catName}>{item.name}</ThemedText>
                      </View>
                      <ThemedText style={styles.catCount}>{item.pct.toFixed(1)}%</ThemedText>
                      <ThemedText style={styles.catAmt}>£{item.amount.toFixed(2)}</ThemedText>
                    </View>
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: t.border, marginTop: 4, marginBottom: 10 }}>
                      <View style={{ height: 8, borderRadius: 4, width: `${item.pct}%` as any, backgroundColor: CATEGORY_COLOURS[index % CATEGORY_COLOURS.length] }} />
                    </View>
                  </View>
                ))
              : <ThemedText style={styles.emptyNote}>No department data in this period.</ThemedText>
          ) : (
            <View style={{ backgroundColor: t.surface, borderRadius: 14, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Ionicons name="lock-closed" size={18} color="#7C3AED" />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <View style={{ backgroundColor: "#7C3AED", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>BUSINESS</Text>
                  </View>
                </View>
                <ThemedText style={{ color: t.text, fontSize: 13, fontWeight: "600" }}>Upgrade to see department breakdowns</ThemedText>
              </View>
              <TouchableOpacity style={{ backgroundColor: "#7C3AED", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }} onPress={() => router.push("/plans" as any)}>
                <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Upgrade</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {stats.topMerchants.length > 0 && (
        <>
          <ThemedText style={styles.sectionTitle}>Top Merchants</ThemedText>
          {stats.topMerchants.map(([name, amt]) => (
            <View key={name} style={styles.merchantRow}>
              <ThemedText style={styles.merchantName}>{name}</ThemedText>
              <ThemedText style={styles.merchantAmt}>£{amt.toFixed(2)}</ThemedText>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );

  const ForecastTab = (
    <ScrollView contentContainerStyle={[styles.inner, { paddingTop: 4 }]} showsVerticalScrollIndicator={false}>
      {forecast ? (
        <>
          {/* tax year progress */}
          <ThemedText style={styles.sectionTitle}>Tax Year {forecast.tyStartYear}/{forecast.tyStartYear + 1}</ThemedText>
          <View style={styles.forecastCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <ThemedText style={styles.forecastCardTitle}>{Math.round(forecast.completionPct)}% of year elapsed</ThemedText>
              <ThemedText style={styles.forecastCardSub}>{forecast.daysRemaining}d left</ThemedText>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(100, forecast.completionPct)}%` as any }]} />
            </View>
            <ThemedText style={{ color: t.textSecondary, fontSize: 11, marginTop: 8 }}>
              {forecast.daysElapsed}d elapsed · Tax year spend so far: £{forecast.tySpend.toFixed(2)}
            </ThemedText>
          </View>

          {/* projection cards */}
          <ThemedText style={styles.sectionTitle}>Projections</ThemedText>
          <View style={styles.grid}>
            <View style={[styles.card, styles.forecastHighlight]}>
              <ThemedText style={styles.cardLabel}>Year-End</ThemedText>
              <ThemedText style={[styles.cardValue, { color: t.accent }]}>£{forecast.projectedYearEnd.toFixed(0)}</ThemedText>
              <ThemedText style={styles.forecastNote}>at current pace</ThemedText>
            </View>
            <View style={styles.card}>
              <ThemedText style={styles.cardLabel}>Remaining</ThemedText>
              <ThemedText style={styles.cardValue}>£{forecast.projectedRemaining.toFixed(0)}</ThemedText>
              <ThemedText style={styles.forecastNote}>next {forecast.daysRemaining}d</ThemedText>
            </View>
            <View style={styles.card}>
              <ThemedText style={styles.cardLabel}>Daily Burn</ThemedText>
              <ThemedText style={styles.cardValueSm}>£{forecast.dailyBurn.toFixed(2)}</ThemedText>
              <ThemedText style={styles.forecastNote}>avg per day</ThemedText>
            </View>
            <View style={styles.card}>
              <ThemedText style={styles.cardLabel}>Next Month</ThemedText>
              <ThemedText style={styles.cardValueSm}>£{forecast.nextMonthForecast.toFixed(0)}</ThemedText>
              <ThemedText style={styles.forecastNote}>3-month avg</ThemedText>
            </View>
          </View>

          {/* trend */}
          {Math.abs(forecast.trendPct) >= 1 && (
            <View style={[styles.forecastCard, { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 }]}>
              <View style={[styles.trendIconWrap, { backgroundColor: forecast.trendPct > 0 ? t.errorSurface : t.successSurface }]}>
                <Text style={{ fontSize: 22, color: forecast.trendPct > 0 ? t.error : t.success }}>{forecast.trendPct > 0 ? "↑" : "↓"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.forecastCardTitle}>Spending {forecast.trendPct > 0 ? "trending up" : "trending down"} {Math.abs(forecast.trendPct).toFixed(1)}%</ThemedText>
                <ThemedText style={styles.forecastCardSub}>Last 3 months vs previous 3 months</ThemedText>
              </View>
            </View>
          )}

          {/* category projections */}
          {forecast.catProjections.length > 0 && (
            <>
              <ThemedText style={styles.sectionTitle}>Category Year-End Projections</ThemedText>
              {forecast.catProjections.sort((a, b) => b.projected - a.projected).map((cp, i) => (
                <View key={cp.cat} style={styles.catRow}>
                  <View style={[styles.catDot, { backgroundColor: CATEGORY_COLOURS[i % CATEGORY_COLOURS.length] }]} />
                  <ThemedText style={styles.catName}>{cp.cat}</ThemedText>
                  <ThemedText style={styles.catCount}>£{cp.current.toFixed(0)} so far</ThemedText>
                  <ThemedText style={[styles.catAmt, { color: t.accent }]}>→ £{cp.projected.toFixed(0)}</ThemedText>
                </View>
              ))}
            </>
          )}
        </>
      ) : (
        <ThemedText style={styles.emptyNote}>Add more claims to see spending forecasts.</ThemedText>
      )}
    </ScrollView>
  );

  const tabContent: Record<NavTab, React.ReactElement> = {
    summary:   SummaryTab,
    charts:    ChartsTab,
    breakdown: BreakdownTab,
    forecast:  ForecastTab,
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>

      {/* page header */}
      <View style={styles.header}>
        <ThemedText style={styles.title}>Analytics</ThemedText>
        <ThemedText style={styles.subtitle}>
          {stats.total} claim{stats.total !== 1 ? "s" : ""} · £{stats.totalSpend.toFixed(2)} total
        </ThemedText>
      </View>

      {/* scope + period controls */}
      <View style={styles.controlsWrap}>
        {role === "admin" && (
          <View style={styles.scopeRow}>
            <TouchableOpacity style={[styles.scopeBtn, scope === "mine" && styles.scopeBtnActive]} onPress={() => setScope("mine")}>
              <Text style={[styles.scopeText as any, scope === "mine" && (styles.scopeTextActive as any)]}>My Claims</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.scopeBtn, scope === "org" && styles.scopeBtnActive]} onPress={() => setScope("org")}>
              <Text style={[styles.scopeText as any, scope === "org" && (styles.scopeTextActive as any)]}>Organisation</Text>
            </TouchableOpacity>
          </View>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodScroll} contentContainerStyle={styles.periodContent}>
          {(["month", "quarter", "year", "tax_year", "all"] as Period[]).map(p => (
            <TouchableOpacity key={p} style={[styles.pill, period === p && styles.pillActive]} onPress={() => setPeriod(p)}>
              <Text style={[styles.pillText as any, period === p && (styles.pillTextActive as any)]}>{PERIOD_LABELS[p]}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* nav tab bar */}
      <View style={styles.navBar}>
        {NAV_TABS.map(tab => (
          <TouchableOpacity key={tab.key} style={[styles.navTab, navTab === tab.key && styles.navTabActive]} onPress={() => setNavTab(tab.key)} activeOpacity={0.7}>
            <Ionicons name={tab.icon} size={16} color={navTab === tab.key ? t.accent : t.textTertiary} />
            <Text style={[styles.navTabText as any, navTab === tab.key && (styles.navTabTextActive as any)]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* active tab content */}
      {tabContent[navTab]}

    </SafeAreaView>
  );
}
