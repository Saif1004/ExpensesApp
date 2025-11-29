import { auth } from "@/app/firebase/firebaseConfig";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { signOut } from "firebase/auth";
import { StyleSheet, TouchableOpacity } from "react-native";

export default function ProfileScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Profile</ThemedText>
      <ThemedText style={styles.subtitle}>Manage your account information.</ThemedText>

      <ThemedView style={styles.card}>
        <ThemedText style={styles.cardTitle}>Email</ThemedText>
        <ThemedText style={styles.cardText}>
          {auth.currentUser?.email}
        </ThemedText>
      </ThemedView>

      {/* 🔥 LOG OUT */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={() => signOut(auth)}
      >
        <ThemedText style={styles.logoutText}>Log Out</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#0F172A",
    minHeight: "100%",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#F8FAFC",
  },
  subtitle: {
    color: "#94A3B8",
    marginBottom: 18,
  },
  card: {
    backgroundColor: "rgba(30,41,59,0.95)",
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
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
  logoutButton: {
    backgroundColor: "#EF4444",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  logoutText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
