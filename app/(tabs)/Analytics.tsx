import {
  collection,
  onSnapshot,
  query,
  where
} from "firebase/firestore";

import { useEffect, useState } from "react";

import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  View
} from "react-native";

import {
  BarChart,
  PieChart
} from "react-native-chart-kit";

import { ThemedText } from "../../components/themed-text";
import { useAuth } from "../context/AuthProvider";
import { db } from "../firebase/firebaseConfig";

const screenWidth = Dimensions.get("window").width;

const AI_URL = process.env.EXPO_PUBLIC_ANALYTICS_AI_URL!;

type Category = "Meals" | "Travel" | "Technology" | "Office";

type Claim = {
  amount: number;
  category: Category;
  status: "pending" | "approved" | "rejected";
  suspicious?: boolean;
};

type CategoryStats = {
  Meals: number;
  Travel: number;
  Technology: number;
  Office: number;
};

export default function AnalyticsScreen() {

  const { user, role } = useAuth();

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

    if (!user) return;

    const q =
      role === "admin"
        ? query(collection(db, "claims"))
        : query(
            collection(db, "claims"),
            where("userId", "==", user.uid)
          );

    const unsub = onSnapshot(q, (snapshot) => {

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

      generateAIInsights(newStats);

    });

    return unsub;

  }, [user, role]);

  async function generateAIInsights(data:any){

    try{

      setAiLoading(true);

      const res = await fetch(AI_URL,{
        method:"POST",
        headers:{ "Content-Type":"application/json"},
        body: JSON.stringify({ stats:data })
      });

      const result = await res.json();

      setAiInsight(result?.insight || "");

    }catch{

      setAiInsight("");

    }finally{

      setAiLoading(false);

    }

  }

  const approvalRate =
    stats.total > 0
      ? ((stats.approved / stats.total) * 100).toFixed(1)
      : "0";

  const chartConfig = {
    backgroundGradientFrom: "#1E293B",
    backgroundGradientTo: "#1E293B",

    fillShadowGradient: "#38BDF8",
    fillShadowGradientOpacity: 1,

    decimalPlaces: 0,

    color: () => "#38BDF8",
    labelColor: () => "#E2E8F0",

    propsForBackgroundLines: {
      stroke: "#334155",
      strokeDasharray: ""
    }
  };

  const categoryData = [
    {
      name: "Meals",
      population: stats.categories.Meals,
      color: "#38BDF8",
      legendFontColor: "#FFF",
      legendFontSize: 12
    },
    {
      name: "Travel",
      population: stats.categories.Travel,
      color: "#22C55E",
      legendFontColor: "#FFF",
      legendFontSize: 12
    },
    {
      name: "Technology",
      population: stats.categories.Technology,
      color: "#FACC15",
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
          <ActivityIndicator color="#38BDF8"/>
        ) : (
          <ThemedText style={styles.aiText}>
            {aiInsight || "No insights available yet."}
          </ThemedText>
        )}

      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
        </View>
      ) : (
        <>

          {/* KPI CARDS */}

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

          {/* STATUS CHART */}

          <ThemedText style={styles.chartTitle}>
            Claim Status
          </ThemedText>

          <BarChart
            data={{
              labels:["Approved","Pending","Rejected"],
              datasets:[{
                data:[
                  stats.approved,
                  stats.pending,
                  stats.rejected
                ]
              }]
            }}
            width={screenWidth-40}
            height={220}
            chartConfig={chartConfig}
            fromZero
            showValuesOnTopOfBars
            style={styles.chart}
          />

          {/* CATEGORY CHART */}

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

const styles = StyleSheet.create({

container:{
flex:1,
padding:20,
backgroundColor:"#0F172A"
},

title:{
marginTop:24,
fontSize:28,
fontWeight:"bold",
color:"#F8FAFC"
},

aiCard:{
backgroundColor:"#1E293B",
padding:16,
borderRadius:14,
marginTop:16
},

aiTitle:{
color:"#38BDF8",
fontWeight:"600",
marginBottom:6
},

aiText:{
color:"#E2E8F0",
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
backgroundColor:"#1E293B",
padding:18,
borderRadius:14
},

label:{
color:"#94A3B8",
fontSize:12
},

value:{
marginTop:6,
fontSize:22,
fontWeight:"bold",
color:"#F8FAFC"
},

warning:{
marginTop:6,
fontSize:22,
fontWeight:"bold",
color:"#F97316"
},

chartTitle:{
marginTop:26,
marginBottom:10,
fontSize:16,
fontWeight:"600",
color:"#E2E8F0"
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