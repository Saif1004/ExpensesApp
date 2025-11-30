import ParallaxScrollView from "@/components/parallax-scroll-view";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { StyleSheet } from "react-native";

export default function AnalyticsScreen() {
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: "#1E293B", dark: "#020617" }}
      headerImage={
        <IconSymbol
          size={260}
          color="#1E293B"
          name="chart.pie.fill"
          style={styles.headerImage}
        />
      }
    >
      <ThemedView style={styles.screen}>
        <ThemedText type="title" style={styles.title}>Analytics</ThemedText>
        <ThemedText style={styles.subtitle}>
          Expense breakdown and monthly stats.
        </ThemedText>

        <ThemedView style={styles.card}>
          <ThemedText style={styles.cardTitle}>Spending Breakdown</ThemedText>
          <ThemedText style={styles.cardText}>Charts coming soon.</ThemedText>
        </ThemedView>

        <ThemedView style={styles.card}>
          <ThemedText style={styles.cardTitle}>Monthly Summary</ThemedText>
          <ThemedText style={styles.cardText}>No data available yet.</ThemedText>
        </ThemedView>
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  headerImage: {
    position: "absolute",
    bottom: -40,
    left: -20,
  },
  screen: {
    padding: 20,
    backgroundColor: "#0F172A",
    minHeight: "100%",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#F8FAFC",
    marginBottom: 6,
  },
  subtitle: {
    color: "#94A3B8",
    marginBottom: 20,
  },
  card: {
    backgroundColor: "rgba(30,41,59,0.95)",
    padding: 18,
    borderRadius: 14,
    marginBottom: 14,
  },
  cardTitle: {
    color: "#E2E8F0",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  cardText: {
    color: "#94A3B8",
  },
});
