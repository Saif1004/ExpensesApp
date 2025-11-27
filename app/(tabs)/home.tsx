import ParallaxScrollView from "@/components/parallax-scroll-view";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { StyleSheet } from "react-native";

export default function HomeScreen() {
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: "#0F172A", dark: "#0F172A" }}
      headerImage={
        <IconSymbol
          size={120}                 // MUCH smaller header icon
          color="#ffffffff"
          name="house.fill"
          style={styles.headerImage}
        />
      }
      contentContainerStyle={styles.scrollContent}
    >
      <ThemedView style={styles.wrapper}>

        {/* TITLE */}
        <ThemedText style={styles.title}>Dashboard</ThemedText>
        <ThemedText style={styles.subtitle}>
          Track spending, upload receipts, and manage your claims.
        </ThemedText>

        {/* CARDS */}
        <ThemedView style={styles.card}>
          <ThemedText style={styles.cardTitle}>This Month’s Spending</ThemedText>
          <ThemedText style={styles.amount}>£0.00</ThemedText>
        </ThemedView>

        <ThemedView style={styles.card}>
          <ThemedText style={styles.cardTitle}>Receipts to Upload</ThemedText>
          <ThemedText style={styles.cardText}>0 pending uploads</ThemedText>
        </ThemedView>

        <ThemedView style={styles.card}>
          <ThemedText style={styles.cardTitle}>Recent Activity</ThemedText>
          <ThemedText style={styles.cardText}>No transactions added yet.</ThemedText>
        </ThemedView>

        <ThemedView style={styles.card}>
          <ThemedText style={styles.cardTitle}>Pending Claims</ThemedText>
          <ThemedText style={styles.cardText}>You have no active claims.</ThemedText>
        </ThemedView>

      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({

  headerImage: {
    position: "absolute",
    bottom: -10,
    right: -10,
    opacity: 0.2,
  },

  scrollContent: {
    paddingBottom: 80,   // ensures tab bar is visible
  },

  wrapper: {
    padding: 20,
    backgroundColor: "#0F172A",
    minHeight: "100%",   // fill screen
  },

  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#F8FAFC",
    marginBottom: 4,
  },

  subtitle: {
    color: "#94A3B8",
    marginBottom: 20,
    fontSize: 14,
  },

  card: {
    backgroundColor: "#1E293B",
    padding: 16,
    borderRadius: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },

  cardTitle: {
    color: "#E2E8F0",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },

  amount: {
    color: "#60A5FA",
    fontSize: 24,
    fontWeight: "700",
  },

  cardText: {
    color: "#94A3B8",
  },
});
