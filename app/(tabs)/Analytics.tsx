import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where
} from "firebase/firestore";

import { useEffect, useMemo, useState } from "react";
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

import { Ionicons } from "@expo/vector-icons";
import PaywallScreen from "../../components/paywall-screen";
import { ThemedText } from "../../components/themed-text";
import { useTheme } from "../../hooks/useTheme";
import { addListener } from "../../utils/listenerStore";
import { useAuth } from "../context/AuthProvider";
import { db } from "../firebase/firebaseConfig";

const screenWidth = Dimensions.get("window").width;
const AI_URL = process.env.EXPO_PUBLIC_ANALYTICS_AI_URL!;

// 10 distinct colours for dynamic categories — no purples
const CATEGORY_COLOURS = [
  "#0066FF", "#22C55E", "#F59E0B", "#F97316",
  "#EF4444", "#06B6D4", "#0EA5E9", "#EC4899",
  "#14B8A6", "#84CC16"
];

type Period = "month" | "quarter" | "year" | "tax_year" | "all";
type Scope  = "mine" | "org";

const PERIOD_LABELS: Record<Period, string> = {
  month:    "This Month",
  quarter:  "This Quarter",
  year:     "This Year",
  tax_year: "Tax Year",
  all:      "All Time"
};

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
};

// Purchase date from string field (YYYY-MM-DD)
function formatDate(c: Claim): string {
  if (c.purchaseDate) {
    try { return new Date(c.purchaseDate).toLocaleDateString("en-GB"); } catch { return c.purchaseDate; }
  }
  return "—";
}

// Submitted date from Firestore timestamp
function submittedDate(c: Claim): string {
  try { return c.createdAt?.toDate().toLocaleDateString("en-GB") ?? "—"; } catch { return "—"; }
}

// UK tax year starts April 6
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
  if (period === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    from = new Date(now.getFullYear(), q * 3, 1);
  } else if (period === "year") {
    from = new Date(now.getFullYear(), 0, 1);
  } else {
    from = taxYearStart();
  }
  return claims.filter(c => {
    const d = c.purchaseDate ? new Date(c.purchaseDate) : c.createdAt?.toDate();
    return d && d >= from;
  });
}

export default function AnalyticsScreen() {
  const { user, role, isPro, isBusiness, orgId, orgCategories } = useAuth();
  const { tokens: t, mode } = useTheme();

  const [loading, setLoading]               = useState(true);
  const [aiLoading, setAiLoading]           = useState(false);
  const [aiInsight, setAiInsight]           = useState("");
  const [period, setPeriod]                 = useState<Period>("month");
  const [scope, setScope]                   = useState<Scope>("mine");
  const [allClaims, setAllClaims]           = useState<Claim[]>([]);
  const [accountCodes, setAccountCodes]     = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user || !user.emailVerified) return;
    const q =
      scope === "org" && role === "admin" && orgId
        ? query(collection(db, "claims"), where("orgId", "==", orgId))
        : query(collection(db, "claims"), where("userId", "==", user.uid));

    setLoading(true);
    const unsub = addListener(onSnapshot(q, snap => {
      const cs: Claim[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Claim));
      setAllClaims(cs);
      setLoading(false);
    }, () => {}));
    return unsub;
  }, [user, role, orgId, scope]);

  // Load org account codes for exports
  useEffect(() => {
    if (!orgId) return;
    getDoc(doc(db, "organisations", orgId)).then(snap => {
      if (snap.exists()) setAccountCodes(snap.data().categoryAccountCodes ?? {});
    }).catch(() => {});
  }, [orgId]);

  // Filtered claims for selected period
  const claims = useMemo(() => filterByPeriod(allClaims, period), [allClaims, period]);

  // Computed stats
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
      if (c.status === "rejected")   rejected++;
      if (c.suspicious)              suspicious++;

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
    const avgValue = total > 0 ? totalSpend / total : 0;
    const approvalRate = total > 0 ? ((approved / total) * 100).toFixed(1) : "0";

    const topMerchants = Object.entries(merchantSpend)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Last 6 calendar months
    const now = new Date();
    const last6 = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return { label: d.toLocaleString("default", { month: "short" }), value: monthly[key] ?? 0 };
    });

    return {
      total, totalSpend, approvedSpend, pendingSpend,
      approved, pending, rejected, suspicious,
      avgValue, approvalRate,
      categoryCount, categorySpend,
      topMerchants, monthlyData: last6
    };
  }, [claims]);

  const cats = orgCategories.length > 0 ? orgCategories : ["Meals", "Travel", "Technology", "Office"];

  // Pie chart — only categories with claims > 0
  const categoryPieData = useMemo(() =>
    cats
      .filter(cat => (stats.categoryCount[cat] ?? 0) > 0)
      .map((cat, i) => ({
        name: cat,
        population: stats.categoryCount[cat] ?? 0,
        color: CATEGORY_COLOURS[i % CATEGORY_COLOURS.length],
        legendFontColor: t.text,
        legendFontSize: 11
      })),
    [stats.categoryCount, cats, t]
  );

  // ── FORECASTS & PROJECTIONS ──────────────────────────
  const forecast = useMemo(() => {
    if (allClaims.length === 0) return null;

    const now = new Date();

    // UK tax year: April 6 – April 5
    const tyStartYear =
      now.getMonth() < 3 || (now.getMonth() === 3 && now.getDate() < 6)
        ? now.getFullYear() - 1
        : now.getFullYear();
    const taxYearStart = new Date(tyStartYear, 3, 6);
    const taxYearEnd   = new Date(tyStartYear + 1, 3, 5);

    const daysInYear   = Math.round((taxYearEnd.getTime() - taxYearStart.getTime()) / 86400000);
    const daysElapsed  = Math.max(1, Math.round((now.getTime() - taxYearStart.getTime()) / 86400000));
    const daysRemaining = Math.max(0, daysInYear - daysElapsed);
    const completionPct = (daysElapsed / daysInYear) * 100;

    // Tax-year spend from allClaims (always full history, ignores period filter)
    const tySpend = allClaims
      .filter(c => {
        const d = c.purchaseDate ? new Date(c.purchaseDate) : c.createdAt?.toDate();
        return d && d >= taxYearStart;
      })
      .reduce((s, c) => s + (Number(c.amount) || 0), 0);

    const dailyBurn       = tySpend / daysElapsed;
    const projectedYearEnd = dailyBurn * daysInYear;
    const projectedRemaining = dailyBurn * daysRemaining;

    // Monthly buckets for trend
    const monthly: Record<string, number> = {};
    allClaims.forEach(c => {
      const d = c.purchaseDate ? new Date(c.purchaseDate) : c.createdAt?.toDate();
      if (d) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthly[key] = (monthly[key] ?? 0) + (Number(c.amount) || 0);
      }
    });

    const monthKey = (offset: number) => {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    };

    // 3-month rolling average (months 1-3 back) vs prior 3 (months 4-6 back)
    const last3Avg = ([1,2,3].reduce((s, i) => s + (monthly[monthKey(i)] ?? 0), 0)) / 3;
    const prev3Avg = ([4,5,6].reduce((s, i) => s + (monthly[monthKey(i)] ?? 0), 0)) / 3;
    const trendPct = prev3Avg > 0 ? ((last3Avg - prev3Avg) / prev3Avg) * 100 : 0;

    // Per-category year-end projections
    const catProjections = cats
      .map(cat => {
        const current = allClaims
          .filter(c => {
            const d = c.purchaseDate ? new Date(c.purchaseDate) : c.createdAt?.toDate();
            return c.category === cat && d && d >= taxYearStart;
          })
          .reduce((s, c) => s + (Number(c.amount) || 0), 0);
        return { cat, current, projected: dailyBurn > 0 ? (current / tySpend) * projectedYearEnd : 0 };
      })
      .filter(cp => cp.current > 0);

    return {
      tyStartYear, daysElapsed, daysRemaining, daysInYear,
      completionPct, tySpend, dailyBurn,
      projectedYearEnd, projectedRemaining,
      trendPct, nextMonthForecast: last3Avg,
      catProjections
    };
  }, [allClaims, cats]);

  // ── AI INSIGHTS ──────────────────────────────────────
  async function generateAIInsights() {
    try {
      setAiLoading(true);
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch(AI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ stats: { ...stats, period } })
      });
      const result = await res.json();
      setAiInsight(result?.error ? result.error : (result?.insight ?? ""));
    } catch {
      setAiInsight("Failed to generate insights.");
    } finally {
      setAiLoading(false);
    }
  }

  // ── EXPORT HELPERS ────────────────────────────────────
  async function getExportClaims(): Promise<Claim[]> {
    if (!user) return [];
    const q = scope === "org" && role === "admin" && orgId
      ? query(collection(db, "claims"), where("orgId", "==", orgId))
      : query(collection(db, "claims"), where("userId", "==", user.uid));
    const snap = await getDocs(q);
    return filterByPeriod(
      snap.docs.map(d => ({ id: d.id, ...d.data() } as Claim)),
      period
    );
  }

  function rowData(cs: Claim[]) {
    return cs.map(c => ({
      claimRef:      c.id ? c.id.slice(0, 8).toUpperCase() : "—",
      employee:      (c as any).userEmail ?? "—",
      merchant:      c.merchant ?? "—",
      amount:        Number(c.amount).toFixed(2),
      category:      c.category ?? "—",
      status:        c.status ?? "—",
      paymentStatus: c.paymentStatus ?? "—",
      approvedBy:    (c as any).approvedBy ?? "—",
      notes:         (c as any).adminFeedback ?? (c as any).description ?? "—",
      purchaseDate:  formatDate(c),
      submittedDate: submittedDate(c),
    }));
  }

  const CSV_HEADER = "Reference,Employee,Merchant,Amount (£),Category,Status,Payment Status,Approved By,Notes,Purchase Date,Submitted Date\n";
  const XLS_HEADER = "Reference\tEmployee\tMerchant\tAmount (£)\tCategory\tStatus\tPayment Status\tApproved By\tNotes\tPurchase Date\tSubmitted Date\n";

  // Default nominal codes (UK standard) — overridden by org's custom accountCodes
  const DEFAULT_ACCOUNT_CODES: Record<string, string> = {
    "Meals": "420", "Travel": "493", "Technology": "404", "Office": "429",
  };
  function getAccountCode(category: string) {
    return accountCodes[category] ?? DEFAULT_ACCOUNT_CODES[category] ?? "429";
  }

  // Xero "Spend Money" import
  const XERO_HEADER = "Date,Amount,Payee,Description,Reference,Account Code,Tax Rate,Currency\n";
  function rowToXero(r: ReturnType<typeof rowData>[0]) {
    return [r.purchaseDate, r.amount, r.merchant, r.category, r.claimRef, getAccountCode(r.category), "20% (VAT on Expenses)", "GBP"]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  }

  // QuickBooks Online expense import
  const QBO_HEADER = "Date,Amount,Description,Account,Payee,Ref No.,Memo\n";
  function rowToQBO(r: ReturnType<typeof rowData>[0]) {
    return [r.purchaseDate, r.amount, r.category, getAccountCode(r.category), r.merchant, r.claimRef, r.notes]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  }

  // Sage 50 expense import
  const SAGE_HEADER = "Date,Reference,Description,Net,Tax Code,Account Ref,Department\n";
  function rowToSage(r: ReturnType<typeof rowData>[0]) {
    return [r.purchaseDate, r.claimRef, `${r.category} - ${r.merchant}`, r.amount, "T1", getAccountCode(r.category), ""]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  }

  function rowToCSV(r: ReturnType<typeof rowData>[0]) {
    return [r.claimRef, r.employee, r.merchant, r.amount, r.category, r.status, r.paymentStatus, r.approvedBy, r.notes, r.purchaseDate, r.submittedDate]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  }

  function rowToXLS(r: ReturnType<typeof rowData>[0]) {
    return [r.claimRef, r.employee, r.merchant, r.amount, r.category, r.status, r.paymentStatus, r.approvedBy, r.notes, r.purchaseDate, r.submittedDate].join("\t");
  }

  async function exportCSV() {
    try {
      const cs = await getExportClaims();
      const rows = rowData(cs).map(rowToCSV);
      const uri = (FileSystem.documentDirectory ?? "") + "claims_export.csv";
      await FileSystem.writeAsStringAsync(uri, CSV_HEADER + rows.join("\n"), {
        encoding: FileSystem.EncodingType.UTF8
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Export CSV" });
      } else {
        Alert.alert("Saved", uri);
      }
    } catch (e: any) { Alert.alert("Export Error", e?.message ?? "Failed to export."); }
  }

  async function exportExcel() {
    try {
      const cs = await getExportClaims();
      const rows = rowData(cs).map(rowToXLS);
      const uri = (FileSystem.documentDirectory ?? "") + "claims_export.xls";
      await FileSystem.writeAsStringAsync(uri, XLS_HEADER + rows.join("\n"), {
        encoding: FileSystem.EncodingType.UTF8
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/vnd.ms-excel", dialogTitle: "Export Excel" });
      } else {
        Alert.alert("Saved", uri);
      }
    } catch (e: any) { Alert.alert("Export Error", e?.message ?? "Failed to export."); }
  }

  function requireBusiness() {
    if (!isBusiness) {
      Alert.alert(
        "Business Plan Required",
        "Accounting software exports (Xero, QuickBooks, Sage) are available on the Business plan (£34.99/mo).",
        [
          { text: "Not Now", style: "cancel" },
          { text: "Upgrade", onPress: () => {} },
        ]
      );
      return false;
    }
    return true;
  }

  async function exportXero() {
    if (!requireBusiness()) return;
    try {
      const cs = await getExportClaims();
      // Only include approved claims for Xero import
      const approved = cs.filter(c => c.status === "approved");
      if (approved.length === 0) {
        Alert.alert("No approved claims", "Xero export only includes approved claims.");
        return;
      }
      const rows = rowData(approved).map(rowToXero);
      const uri = (FileSystem.documentDirectory ?? "") + "xero_import.csv";
      await FileSystem.writeAsStringAsync(uri, XERO_HEADER + rows.join("\n"), {
        encoding: FileSystem.EncodingType.UTF8
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Export for Xero" });
      } else {
        Alert.alert("Saved", uri);
      }
    } catch (e: any) { Alert.alert("Export Error", e?.message ?? "Failed to export."); }
  }

  async function exportQuickBooks() {
    if (!requireBusiness()) return;
    try {
      const cs = await getExportClaims();
      const approved = cs.filter(c => c.status === "approved");
      if (approved.length === 0) {
        Alert.alert("No approved claims", "QuickBooks export only includes approved claims.");
        return;
      }
      const rows = rowData(approved).map(rowToQBO);
      const uri = (FileSystem.documentDirectory ?? "") + "quickbooks_import.csv";
      await FileSystem.writeAsStringAsync(uri, QBO_HEADER + rows.join("\n"), {
        encoding: FileSystem.EncodingType.UTF8
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Export for QuickBooks" });
      } else { Alert.alert("Saved", uri); }
    } catch (e: any) { Alert.alert("Export Error", e?.message ?? "Failed to export."); }
  }

  async function exportSage() {
    if (!requireBusiness()) return;
    try {
      const cs = await getExportClaims();
      const approved = cs.filter(c => c.status === "approved");
      if (approved.length === 0) {
        Alert.alert("No approved claims", "Sage export only includes approved claims.");
        return;
      }
      const rows = rowData(approved).map(rowToSage);
      const uri = (FileSystem.documentDirectory ?? "") + "sage_import.csv";
      await FileSystem.writeAsStringAsync(uri, SAGE_HEADER + rows.join("\n"), {
        encoding: FileSystem.EncodingType.UTF8
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Export for Sage" });
      } else { Alert.alert("Saved", uri); }
    } catch (e: any) { Alert.alert("Export Error", e?.message ?? "Failed to export."); }
  }

  async function exportPDF() {
    try {
      const cs = await getExportClaims();
      const rows = rowData(cs);
      const grandTotal = rows.reduce((s, r) => s + parseFloat(r.amount), 0).toFixed(2);
      const periodLabel = PERIOD_LABELS[period];

      const tableRows = rows.map(r => `
        <tr>
          <td>${r.claimRef}</td>
          <td>${r.employee}</td>
          <td>${r.merchant}</td>
          <td>£${r.amount}</td>
          <td>${r.category}</td>
          <td class="status-${r.status}">${r.status}</td>
          <td>${r.paymentStatus}</td>
          <td>${r.approvedBy}</td>
          <td>${r.notes}</td>
          <td>${r.purchaseDate}</td>
          <td>${r.submittedDate}</td>
        </tr>`).join("");

      const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; margin: 32px; color: #0D1B2A; font-size: 11px; }
  h1 { font-size: 22px; margin-bottom: 4px; color: #0D1B2A; }
  .meta { color: #6B7A8D; margin: 0 0 24px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #0066FF; color: #fff; padding: 7px 8px; text-align: left; font-size: 10px; }
  td { padding: 6px 8px; border-bottom: 1px solid #E8ECF0; font-size: 10px; }
  tr:nth-child(even) td { background: #F8F9FC; }
  .status-approved { color: #16a34a; font-weight: 600; }
  .status-pending  { color: #d97706; font-weight: 600; }
  .status-rejected { color: #dc2626; font-weight: 600; }
  .total-row { text-align: right; margin-top: 16px; font-weight: 700; font-size: 13px; color: #0D1B2A; }
  .footer { margin-top: 32px; color: #A0ACBB; font-size: 10px; border-top: 1px solid #E8ECF0; padding-top: 12px; }
</style></head>
<body>
  <h1>Claimio — Expense Report</h1>
  <p class="meta">
    Period: ${periodLabel} &nbsp;·&nbsp;
    Generated: ${new Date().toLocaleDateString("en-GB")} &nbsp;·&nbsp;
    ${rows.length} claim${rows.length !== 1 ? "s" : ""}
  </p>
  <table>
    <thead><tr>
      <th>Ref</th><th>Employee</th><th>Merchant</th><th>Amount</th>
      <th>Category</th><th>Status</th><th>Payment</th>
      <th>Approved By</th><th>Notes</th><th>Purchase Date</th><th>Submitted</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <p class="total-row">Total: £${grandTotal}</p>
  <p class="footer">This report was generated by Claimio. For accounting and tax purposes only.</p>
</body></html>`;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Export PDF" });
      } else {
        Alert.alert("Saved", uri);
      }
    } catch (e: any) { Alert.alert("Export Error", e?.message ?? "Failed to export."); }
  }

  // ── STYLES ────────────────────────────────────────────
  const isDark = mode === "dark";
  const { chartConfig, styles } = useMemo(() => {
    const cfg = {
      backgroundGradientFrom: t.surface,
      backgroundGradientTo:   t.surface,
      fillShadowGradient:        t.accent,
      fillShadowGradientOpacity: 1,
      decimalPlaces: 0,
      color:      () => t.accent,
      labelColor: () => t.textSecondary,
      propsForBackgroundLines: { stroke: t.border, strokeDasharray: "" }
    };

    const shadow = isDark ? {} : {
      shadowColor: "#000" as string, shadowOffset: { width: 0, height: 2 } as any,
      shadowOpacity: 0.07 as number, shadowRadius: 10 as number, elevation: 3 as number
    };

    const st = StyleSheet.create({
      container:      { flex: 1, backgroundColor: t.bg },
      inner:          { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 60 },
      title:          { fontSize: 28, fontWeight: "800", color: t.text, letterSpacing: -0.8, marginBottom: 2 },
      subtitle:       { color: t.textSecondary, fontSize: 13, marginBottom: 12 },
      scopeRow:       { flexDirection: "row", backgroundColor: t.surface, borderRadius: 999,
                        padding: 4, marginBottom: 20, ...shadow },
      scopeBtn:       { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 999 },
      scopeBtnActive: { backgroundColor: t.accent },
      scopeText:      { fontSize: 13, fontWeight: "600", color: t.textSecondary },
      scopeTextActive:{ color: "#FFFFFF" },
      periodRow:      { flexDirection: "row", gap: 8, marginBottom: 20, flexWrap: "wrap" },
      pill:           { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
                        backgroundColor: t.surface },
      pillActive:     { backgroundColor: t.accent },
      pillText:       { color: t.textSecondary, fontSize: 12, fontWeight: "600" },
      pillTextActive: { color: "#FFFFFF", fontWeight: "700" },
      grid:           { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 8 },
      card:           { width: "47%", backgroundColor: t.surface, padding: 16, borderRadius: 18, ...shadow },
      cardLabel:      { color: t.textSecondary, fontSize: 11, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
      cardValue:      { fontSize: 22, fontWeight: "800", color: t.text, letterSpacing: -0.5 },
      cardValueSm:    { fontSize: 18, fontWeight: "700", color: t.text, letterSpacing: -0.3 },
      sectionTitle:   { fontSize: 16, fontWeight: "700", color: t.text, marginTop: 28, marginBottom: 12, letterSpacing: -0.3 },
      aiCard:         { backgroundColor: t.surface, padding: 18, borderRadius: 18,
                        marginBottom: 4, ...shadow },
      aiTitle:        { color: t.text, fontWeight: "700", marginBottom: 6, fontSize: 14 },
      aiText:         { color: t.textSecondary, lineHeight: 20, fontSize: 13 },
      aiBtn:          { backgroundColor: t.accent, padding: 13, borderRadius: 999, marginTop: 12, alignItems: "center" },
      exportRow:      { flexDirection: "row", gap: 8, marginBottom: 4 },
      exportBtn:      { flex: 1, backgroundColor: t.surface, borderRadius: 999,
                        paddingVertical: 10, alignItems: "center", ...shadow },
      exportBtnText:  { color: t.textSecondary, fontWeight: "700", fontSize: 11 },
      chart:          { borderRadius: 16 },
      merchantRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                        paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.border },
      merchantName:   { color: t.text, fontSize: 13, fontWeight: "500", flex: 1 },
      merchantAmt:    { color: t.text, fontSize: 13, fontWeight: "800" },
      catRow:         { flexDirection: "row", alignItems: "center", paddingVertical: 9,
                        borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.border },
      catDot:         { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
      catName:        { color: t.text, fontSize: 13, flex: 1 },
      catCount:       { color: t.textSecondary, fontSize: 12, marginRight: 12 },
      catAmt:         { color: t.text, fontSize: 13, fontWeight: "700", minWidth: 70, textAlign: "right" },
      center:         { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 60 },
      emptyNote:      { color: t.textSecondary, fontSize: 13, textAlign: "center", marginTop: 6, marginBottom: 4 },

      // Forecast styles
      forecastCard:   { backgroundColor: t.surface, borderRadius: 18, padding: 16, marginBottom: 12, ...shadow },
      forecastHighlight: { backgroundColor: t.accentSurface },
      forecastCardTitle: { color: t.text, fontWeight: "700", fontSize: 14, marginBottom: 2 },
      forecastCardSub:   { color: t.textSecondary, fontSize: 12 },
      forecastMeta:   { color: t.textSecondary, fontSize: 11, marginTop: 8, textAlign: "right" },
      forecastNote:   { color: t.textSecondary, fontSize: 10, marginTop: 2 },
      progressTrack:  { height: 6, backgroundColor: t.border, borderRadius: 999, marginTop: 10, overflow: "hidden" },
      progressFill:   { height: 6, backgroundColor: t.accent, borderRadius: 999 },
      trendIconWrap:  { width: 40, height: 40, borderRadius: 999, justifyContent: "center", alignItems: "center" },
    });

    return { chartConfig: cfg, styles: st };
  }, [t, isDark]);

  // All hooks are above this line — safe to return early now
  if (!isPro) return <PaywallScreen />;

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={t.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={[styles.inner, { marginTop: 10 }]}>
      <ThemedText style={styles.title}>Analytics</ThemedText>
      <ThemedText style={styles.subtitle}>
        {stats.total} claim{stats.total !== 1 ? "s" : ""} · £{stats.totalSpend.toFixed(2)} total spend
      </ThemedText>

      {/* Admin scope toggle */}
      {role === "admin" && (
        <View style={styles.scopeRow}>
          <TouchableOpacity
            style={[styles.scopeBtn, scope === "mine" && styles.scopeBtnActive]}
            onPress={() => setScope("mine")}
          >
            <Text style={[styles.scopeText as any, scope === "mine" && (styles.scopeTextActive as any)]}>
              My Claims
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scopeBtn, scope === "org" && styles.scopeBtnActive]}
            onPress={() => setScope("org")}
          >
            <Text style={[styles.scopeText as any, scope === "org" && (styles.scopeTextActive as any)]}>
              Organisation
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Period filter */}
      <View style={styles.periodRow}>
        {(["month", "quarter", "year", "tax_year", "all"] as Period[]).map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.pill, period === p && styles.pillActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.pillText as any, period === p && (styles.pillTextActive as any)]}>
              {PERIOD_LABELS[p]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary cards */}
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
          <ThemedText style={styles.cardLabel}>Approved Spend</ThemedText>
          <ThemedText style={[styles.cardValue, { color: t.success }]}>
            £{stats.approvedSpend.toFixed(2)}
          </ThemedText>
        </View>
        <View style={styles.card}>
          <ThemedText style={styles.cardLabel}>Pending Spend</ThemedText>
          <ThemedText style={[styles.cardValue, { color: t.warning }]}>
            £{stats.pendingSpend.toFixed(2)}
          </ThemedText>
        </View>
        <View style={styles.card}>
          <ThemedText style={styles.cardLabel}>Avg Claim Value</ThemedText>
          <ThemedText style={styles.cardValueSm}>£{stats.avgValue.toFixed(2)}</ThemedText>
        </View>
        <View style={styles.card}>
          <ThemedText style={styles.cardLabel}>Suspicious Flags</ThemedText>
          <ThemedText style={[styles.cardValue, { color: stats.suspicious > 0 ? t.warning : t.success }]}>
            {stats.suspicious}
          </ThemedText>
        </View>
      </View>

      {/* Export */}
      <ThemedText style={styles.sectionTitle}>Export</ThemedText>
      <View style={styles.exportRow}>
        <TouchableOpacity style={styles.exportBtn} onPress={exportCSV}>
          <ThemedText style={styles.exportBtnText}>CSV</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.exportBtn} onPress={exportExcel}>
          <ThemedText style={styles.exportBtnText}>Excel</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.exportBtn} onPress={exportPDF}>
          <ThemedText style={styles.exportBtnText}>PDF</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.exportBtn, { borderColor: '#00B5A3' }]} onPress={exportXero}>
          {!isBusiness && <Ionicons name="lock-closed" size={10} color="#00B5A3" style={{ marginRight: 3 }} />}
          <ThemedText style={[styles.exportBtnText, { color: '#00B5A3' }]}>Xero</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.exportBtn, { borderColor: '#2CA01C' }]} onPress={exportQuickBooks}>
          {!isBusiness && <Ionicons name="lock-closed" size={10} color="#2CA01C" style={{ marginRight: 3 }} />}
          <ThemedText style={[styles.exportBtnText, { color: '#2CA01C' }]}>QBO</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.exportBtn, { borderColor: '#00DC82' }]} onPress={exportSage}>
          {!isBusiness && <Ionicons name="lock-closed" size={10} color="#00DC82" style={{ marginRight: 3 }} />}
          <ThemedText style={[styles.exportBtnText, { color: '#00DC82' }]}>Sage</ThemedText>
        </TouchableOpacity>
      </View>

      {/* AI Insights */}
      <ThemedText style={styles.sectionTitle}>AI Insights</ThemedText>
      <View style={styles.aiCard}>
        <ThemedText style={styles.aiTitle}>✦ Spending Analysis</ThemedText>
        {aiLoading ? (
          <ActivityIndicator color={t.accent} />
        ) : (
          <ThemedText style={styles.aiText}>
            {aiInsight || "Tap below to generate spending insights for this period."}
          </ThemedText>
        )}
        <TouchableOpacity style={styles.aiBtn} onPress={generateAIInsights}>
          <ThemedText style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
            Generate Insights
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* Claim status bar chart */}
      <ThemedText style={styles.sectionTitle}>Claim Status</ThemedText>
      <BarChart
        data={{
          labels: ["Approved", "Pending", "Rejected"],
          datasets: [{ data: [stats.approved, stats.pending, stats.rejected] }]
        }}
        width={screenWidth - 40}
        height={200}
        chartConfig={chartConfig}
        fromZero
        showValuesOnTopOfBars
        yAxisLabel=""
        yAxisSuffix=""
        style={styles.chart}
      />

      {/* Monthly spend (last 6 months) */}
      <ThemedText style={styles.sectionTitle}>Monthly Spend</ThemedText>
      <BarChart
        data={{
          labels: stats.monthlyData.map(m => m.label),
          datasets: [{ data: stats.monthlyData.map(m => m.value) }]
        }}
        width={screenWidth - 40}
        height={200}
        chartConfig={chartConfig}
        fromZero
        showValuesOnTopOfBars
        yAxisLabel="£"
        yAxisSuffix=""
        style={styles.chart}
      />

      {/* Claims by category pie */}
      <ThemedText style={styles.sectionTitle}>Claims by Category</ThemedText>
      {categoryPieData.length > 0 ? (
        <PieChart
          data={categoryPieData}
          width={screenWidth - 40}
          height={200}
          chartConfig={chartConfig}
          accessor="population"
          backgroundColor="transparent"
          paddingLeft="10"
        />
      ) : (
        <ThemedText style={styles.emptyNote}>No claims in this period.</ThemedText>
      )}

      {/* Category breakdown */}
      <ThemedText style={styles.sectionTitle}>Category Breakdown</ThemedText>
      {cats.filter(cat => (stats.categoryCount[cat] ?? 0) > 0).length > 0
        ? cats
            .filter(cat => (stats.categoryCount[cat] ?? 0) > 0)
            .map((cat, i) => (
              <View key={cat} style={styles.catRow}>
                <View style={[styles.catDot, { backgroundColor: CATEGORY_COLOURS[i % CATEGORY_COLOURS.length] }]} />
                <ThemedText style={styles.catName}>{cat}</ThemedText>
                <ThemedText style={styles.catCount}>
                  {stats.categoryCount[cat]} claim{stats.categoryCount[cat] !== 1 ? "s" : ""}
                </ThemedText>
                <ThemedText style={styles.catAmt}>£{(stats.categorySpend[cat] ?? 0).toFixed(2)}</ThemedText>
              </View>
            ))
        : <ThemedText style={styles.emptyNote}>No claims in this period.</ThemedText>
      }

      {/* Forecasts & Projections */}
      {forecast && (
        <>
          <ThemedText style={styles.sectionTitle}>Forecasts & Projections</ThemedText>

          {/* Tax year progress bar */}
          <View style={styles.forecastCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <ThemedText style={styles.forecastCardTitle}>
                Tax Year {forecast.tyStartYear}/{forecast.tyStartYear + 1}
              </ThemedText>
              <ThemedText style={styles.forecastCardSub}>
                {Math.round(forecast.completionPct)}% elapsed
              </ThemedText>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(100, forecast.completionPct)}%` as any }]} />
            </View>
            <ThemedText style={styles.forecastMeta}>
              {forecast.daysElapsed}d elapsed · {forecast.daysRemaining}d remaining
            </ThemedText>
          </View>

          {/* Projection cards */}
          <View style={styles.grid}>
            <View style={[styles.card, styles.forecastHighlight]}>
              <ThemedText style={styles.cardLabel}>Year-End Projected</ThemedText>
              <ThemedText style={[styles.cardValue, { color: t.accent }]}>
                £{forecast.projectedYearEnd.toFixed(0)}
              </ThemedText>
              <ThemedText style={styles.forecastNote}>at current pace</ThemedText>
            </View>
            <View style={styles.card}>
              <ThemedText style={styles.cardLabel}>Remaining Forecast</ThemedText>
              <ThemedText style={styles.cardValue}>
                £{forecast.projectedRemaining.toFixed(0)}
              </ThemedText>
              <ThemedText style={styles.forecastNote}>next {forecast.daysRemaining}d</ThemedText>
            </View>
            <View style={styles.card}>
              <ThemedText style={styles.cardLabel}>Daily Burn Rate</ThemedText>
              <ThemedText style={styles.cardValueSm}>£{forecast.dailyBurn.toFixed(2)}</ThemedText>
              <ThemedText style={styles.forecastNote}>avg per day</ThemedText>
            </View>
            <View style={styles.card}>
              <ThemedText style={styles.cardLabel}>Next Month Est.</ThemedText>
              <ThemedText style={styles.cardValueSm}>
                £{forecast.nextMonthForecast.toFixed(0)}
              </ThemedText>
              <ThemedText style={styles.forecastNote}>3-month rolling avg</ThemedText>
            </View>
          </View>

          {/* MoM trend indicator */}
          {Math.abs(forecast.trendPct) >= 1 && (
            <View style={[styles.forecastCard, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
              <View style={[
                styles.trendIconWrap,
                { backgroundColor: forecast.trendPct > 0 ? t.errorSurface : t.successSurface }
              ]}>
                <Text style={{
                  fontSize: 20,
                  color: forecast.trendPct > 0 ? t.error : t.success
                }}>
                  {forecast.trendPct > 0 ? "↑" : "↓"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.forecastCardTitle}>
                  Spending {forecast.trendPct > 0 ? "trending up" : "trending down"} {Math.abs(forecast.trendPct).toFixed(1)}%
                </ThemedText>
                <ThemedText style={styles.forecastCardSub}>
                  Last 3 months vs previous 3 months
                </ThemedText>
              </View>
            </View>
          )}

          {/* Per-category year-end projections */}
          {forecast.catProjections.length > 0 && (
            <>
              <ThemedText style={[styles.sectionTitle, { marginTop: 8 }]}>
                Category Year-End Projections
              </ThemedText>
              {forecast.catProjections
                .sort((a, b) => b.projected - a.projected)
                .map((cp, i) => (
                  <View key={cp.cat} style={styles.catRow}>
                    <View style={[styles.catDot, { backgroundColor: CATEGORY_COLOURS[i % CATEGORY_COLOURS.length] }]} />
                    <ThemedText style={styles.catName}>{cp.cat}</ThemedText>
                    <ThemedText style={styles.catCount}>£{cp.current.toFixed(0)} so far</ThemedText>
                    <ThemedText style={[styles.catAmt, { color: t.accent }]}>
                      → £{cp.projected.toFixed(0)}
                    </ThemedText>
                  </View>
                ))
              }
            </>
          )}
        </>
      )}

      {/* Top merchants */}
      {stats.topMerchants.length > 0 && (
        <>
          <ThemedText style={styles.sectionTitle}>Top Merchants by Spend</ThemedText>
          {stats.topMerchants.map(([name, amt]) => (
            <View key={name} style={styles.merchantRow}>
              <ThemedText style={styles.merchantName}>{name}</ThemedText>
              <ThemedText style={styles.merchantAmt}>£{amt.toFixed(2)}</ThemedText>
            </View>
          ))}
        </>
      )}

    </ScrollView>
    </SafeAreaView>
  );
}
