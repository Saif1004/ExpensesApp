import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where
} from "firebase/firestore";

import { useEffect, useMemo, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View
} from "react-native";

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import {
  BarChart,
  PieChart
} from "react-native-chart-kit";

import PaywallScreen from "../../components/paywall-screen";
import { ThemedText } from "../../components/themed-text";
import { useAuth } from "../context/AuthProvider";
import { db } from "../firebase/firebaseConfig";
import { addListener } from "../../utils/listenerStore";
import { useTheme } from "../../hooks/useTheme";

const screenWidth = Dimensions.get("window").width;

const AI_URL = process.env.EXPO_PUBLIC_ANALYTICS_AI_URL!;

type Category = "Meals" | "Travel" | "Technology" | "Office";

type Claim = {
  amount: number;
  category: Category;
  status: "pending" | "approved" | "rejected";
  suspicious?: boolean;
  merchant?: string;
  paymentStatus?: string;
  createdAt?: { toDate: () => Date };
};

type CategoryStats = {
  Meals: number;
  Travel: number;
  Technology: number;
  Office: number;
};

export default function AnalyticsScreen() {

  const { user, role, isPro, orgId } = useAuth();
  const { tokens: t } = useTheme();

  if(!isPro) return <PaywallScreen />;

  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState("");

  const [stats, setStats] = useState({
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    suspicious: 0,
    avgValue: 0,
    categories: {
      Meals: 0,
      Travel: 0,
      Technology: 0,
      Office: 0
    } as CategoryStats
  });

  useEffect(() => {

    if (!user || !user.emailVerified) return;

    // Admin: scope to org. Employee: scope to own userId.
    // Unscoped queries fail Firestore rules (permission-denied).
    const q =
      role === "admin" && orgId
        ? query(collection(db, "claims"), where("orgId", "==", orgId))
        : query(collection(db, "claims"), where("userId", "==", user.uid));

    const unsub = addListener(onSnapshot(q, (snapshot) => {

      const claims: Claim[] =
        snapshot.docs.map((doc) => doc.data() as Claim);

      let approved = 0;
      let pending = 0;
      let rejected = 0;
      let suspicious = 0;
      let totalAmount = 0;

      const categories: CategoryStats = {
        Meals: 0,
        Travel: 0,
        Technology: 0,
        Office: 0
      };

      claims.forEach((c) => {

        totalAmount += Number(c.amount);

        if (c.status === "approved") approved++;
        if (c.status === "pending") pending++;
        if (c.status === "rejected") rejected++;

        if (c.suspicious) suspicious++;

        categories[c.category]++;

      });

      const total = claims.length;
      const avgValue =
        total > 0 ? totalAmount / total : 0;

      const newStats = {
        total,
        approved,
        pending,
        rejected,
        suspicious,
        avgValue,
        categories
      };

      setStats(newStats);
      setLoading(false);

    }, () => { /* silently swallow permission-denied on sign-out/delete */ }));

    return unsub;

  }, [user, role, orgId]);

  async function generateAIInsights(data:any){

    try{

      setAiLoading(true);

      if(!user) return;

      const token = await user.getIdToken();

      const res = await fetch(AI_URL,{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization":`Bearer ${token}`
        },
        body: JSON.stringify({ stats:data })
      });

      const result = await res.json();

      if(result?.error){
        setAiInsight(result.error);
      } else {
        setAiInsight(result?.insight || "");
      }

    }catch{

      setAiInsight("Failed to generate insights.");

    }finally{

      setAiLoading(false);

    }

  }

  async function exportCSV() {
    try {
      if (!user) return;

      const q =
        role === "admin" && orgId
          ? query(collection(db, "claims"), where("orgId", "==", orgId))
          : query(collection(db, "claims"), where("userId", "==", user.uid));

      const snapshot = await getDocs(q);
      const claims: Claim[] = snapshot.docs.map((d) => d.data() as Claim);

      const header = "Merchant,Amount,Category,Status,Payment Status,Date\n";
      const rows = claims.map((c) => {
        const merchant = (c.merchant ?? "").replace(/,/g, " ");
        const amount = Number(c.amount).toFixed(2);
        const category = (c.category ?? "").replace(/,/g, " ");
        const status = c.status ?? "";
        const paymentStatus = c.paymentStatus ?? "";
        const date = c.createdAt ? c.createdAt.toDate().toISOString().split("T")[0] : "";
        return `${merchant},${amount},${category},${status},${paymentStatus},${date}`;
      });

      const csv = header + rows.join("\n");
      const fileUri = (FileSystem.documentDirectory ?? "") + "claims_export.csv";

      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType: "text/csv", dialogTitle: "Export Claims CSV" });
      } else {
        Alert.alert("Export saved", `CSV saved to:\n${fileUri}`);
      }
    } catch (e: any) {
      Alert.alert("Export Error", e?.message ?? "Failed to export CSV.");
    }
  }

  const approvalRate =
    stats.total > 0
      ? ((stats.approved / stats.total) * 100).toFixed(1)
      : "0";

  const { chartConfig, categoryData, styles } = useMemo(() => {
    const cfg = {
      backgroundGradientFrom: t.surface,
      backgroundGradientTo: t.surface,

      fillShadowGradient: t.accent,
      fillShadowGradientOpacity: 1,

      decimalPlaces: 0,

      color: () => t.accent,
      labelColor: () => t.textSecondary,

      propsForBackgroundLines: {
        stroke: t.border,
        strokeDasharray: ""
      }
    };

    const catData = [
      {
        name: "Meals",
        population: stats.categories.Meals,
        color: t.accent,
        legendFontColor: "#FFF",
        legendFontSize: 12
      },
      {
        name: "Travel",
        population: stats.categories.Travel,
        color: t.success,
        legendFontColor: "#FFF",
        legendFontSize: 12
      },
      {
        name: "Technology",
        population: stats.categories.Technology,
        color: t.warning,
        legendFontColor: "#FFF",
        legendFontSize: 12
      },
      {
        name: "Office",
        population: stats.categories.Office,
        color: "#F97316",
        legendFontColor: "#FFF",
        legendFontSize: 12
      }
    ];

    const st = StyleSheet.create({

      container:{
        flex:1,
        padding:20,
        backgroundColor: t.bg
      },

      title:{
        marginTop:24,
        fontSize:28,
        fontWeight:"bold",
        color: t.text
      },

      aiCard:{
        backgroundColor: t.surface,
        padding:16,
        borderRadius:14,
        marginTop:16
      },

      aiTitle:{
        color: t.accent,
        fontWeight:"600",
        marginBottom:6
      },

      aiText:{
        color: t.text,
        lineHeight:20
      },

      grid:{
        flexDirection:"row",
        flexWrap:"wrap",
        gap:14,
        marginTop:20
      },

      card:{
        width:"47%",
        backgroundColor: t.surface,
        padding:18,
        borderRadius:14
      },

      label:{
        color: t.textSecondary,
        fontSize:12
      },

      value:{
        marginTop:6,
        fontSize:22,
        fontWeight:"bold",
        color: t.text
      },

      warning:{
        marginTop:6,
        fontSize:22,
        fontWeight:"bold",
        color:"#F97316"
      },

      exportBtn:{
        marginTop:20,
        borderWidth:1,
        borderColor: t.accent,
        borderRadius:10,
        paddingVertical:12,
        alignItems:"center"
      },

      exportBtnText:{
        color: t.accent,
        fontWeight:"700",
        fontSize:14
      },

      chartTitle:{
        marginTop:26,
        marginBottom:10,
        fontSize:16,
        fontWeight:"600",
        color: t.text
      },

      chart:{
        borderRadius:16
      },

      center:{
        flex:1,
        justifyContent:"center",
        alignItems:"center"
      }

    });

    return { chartConfig: cfg, categoryData: catData, styles: st };
  }, [t, stats.categories]);

  return (
    <ScrollView style={styles.container}>

      <ThemedText type="title" style={styles.title}>
        Analytics Dashboard
      </ThemedText>

      {/* AI INSIGHTS */}

      <View style={styles.aiCard}>

        <ThemedText style={styles.aiTitle}>
          AI Insights
        </ThemedText>

        {aiLoading ? (
          <ActivityIndicator color={t.accent}/>
        ) : (
          <ThemedText style={styles.aiText}>
            {aiInsight || "No insights available yet."}
          </ThemedText>
        )}

        {/* 🔥 BUTTON ADDED */}
        <TouchableOpacity
          onPress={()=>generateAIInsights(stats)}
          style={{
            backgroundColor: t.accent,
            padding:12,
            borderRadius:10,
            marginTop:10
          }}
        >
          <ThemedText style={{color: t.accentText, textAlign:"center"}}>
            Generate AI Insight
          </ThemedText>
        </TouchableOpacity>

      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={t.accent} />
        </View>
      ) : (
        <>

          <View style={styles.grid}>

            <View style={styles.card}>
              <ThemedText style={styles.label}>
                Total Claims
              </ThemedText>
              <ThemedText style={styles.value}>
                {stats.total}
              </ThemedText>
            </View>

            <View style={styles.card}>
              <ThemedText style={styles.label}>
                Approval Rate
              </ThemedText>
              <ThemedText style={styles.value}>
                {approvalRate}%
              </ThemedText>
            </View>

            <View style={styles.card}>
              <ThemedText style={styles.label}>
                Average Claim
              </ThemedText>
              <ThemedText style={styles.value}>
                £{stats.avgValue.toFixed(2)}
              </ThemedText>
            </View>

            <View style={styles.card}>
              <ThemedText style={styles.label}>
                Suspicious Claims
              </ThemedText>
              <ThemedText style={styles.warning}>
                {stats.suspicious}
              </ThemedText>
            </View>

          </View>

          {/* Export CSV */}
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={exportCSV}
          >
            <ThemedText style={styles.exportBtnText}>
              Export CSV
            </ThemedText>
          </TouchableOpacity>

          <ThemedText style={styles.chartTitle}>
            Claim Status
          </ThemedText>

          <BarChart
            data={{
              labels: ["Approved", "Pending", "Rejected"],
              datasets: [
                {
                  data: [
                    stats.approved,
                    stats.pending,
                    stats.rejected
                  ]
                }
              ]
            }}
            width={screenWidth - 40}
            height={220}
            chartConfig={chartConfig}
            fromZero
            showValuesOnTopOfBars
            yAxisLabel=""
            yAxisSuffix=""
            style={styles.chart}
          />

          <ThemedText style={styles.chartTitle}>
            Claims by Category
          </ThemedText>

          <PieChart
            data={categoryData}
            width={screenWidth-40}
            height={220}
            chartConfig={chartConfig}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="10"
          />

        </>
      )}

    </ScrollView>
  );
}
