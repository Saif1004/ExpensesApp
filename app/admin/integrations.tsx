import { router } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";
import UpgradeGate from "../../components/upgrade-gate";
import { db } from "../firebase/firebaseConfig";
import { useAuth } from "../context/AuthProvider";
import { useTheme } from "../../hooks/useTheme";

export default function IntegrationsScreen() {
  const { orgId, isBusiness } = useAuth();
  const { tokens: t, mode } = useTheme();
  const isDark = mode === "dark";
  const insets = useSafeAreaInsets();

  const [slackUrl, setSlackUrl]   = useState("");
  const [teamsUrl, setTeamsUrl]   = useState("");
  const [saving, setSaving]       = useState(false);
  const [testing, setTesting]     = useState<"slack" | "teams" | null>(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!orgId) return;
    getDoc(doc(db, "organisations", orgId))
      .then(snap => {
        const d = snap.data() ?? {};
        setSlackUrl(d.slackWebhookUrl ?? "");
        setTeamsUrl(d.teamsWebhookUrl ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  async function handleSave() {
    if (!orgId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "organisations", orgId), {
        slackWebhookUrl:  slackUrl.trim()  || null,
        teamsWebhookUrl:  teamsUrl.trim()  || null,
      });
      Alert.alert("Saved", "Integration settings updated.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(type: "slack" | "teams") {
    const url = type === "slack" ? slackUrl.trim() : teamsUrl.trim();
    if (!url) { Alert.alert("No URL", "Enter a webhook URL first."); return; }
    setTesting(type);
    try {
      const payload = type === "slack"
        ? { text: "✅ Claimio integration test — this is working correctly!" }
        : {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            themeColor: "6366F1",
            summary: "Claimio test",
            sections: [{ activityTitle: "✅ Claimio integration test", activitySubtitle: "This is working correctly!" }],
          };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        Alert.alert("Success", "Test message sent successfully!");
      } else {
        Alert.alert("Failed", `Webhook returned status ${res.status}. Check your URL.`);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not reach webhook URL.");
    } finally {
      setTesting(null);
    }
  }

  const styles = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },
    headerTitle: { color: t.text, fontSize: 17, fontWeight: "700" },
    backBtn: { width: 40, height: 40, justifyContent: "center" },
    container: { paddingHorizontal: 20, paddingTop: 20 },
    infoCard: {
      backgroundColor: t.surface,
      borderRadius: 20,
      padding: 16,
      marginBottom: 20,
      ...(isDark ? {} : { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 3 }),
    },
    infoTitle: { color: t.text, fontSize: 15, fontWeight: "700", marginBottom: 8 },
    infoText: { color: t.textSecondary, fontSize: 13, lineHeight: 20 },
    sectionLabel: {
      color: t.textTertiary,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase",
      marginBottom: 8,
    },
    card: {
      backgroundColor: t.surface,
      borderRadius: 20,
      padding: 16,
      marginBottom: 20,
      ...(isDark ? {} : { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 3 }),
    },
    urlInput: {
      backgroundColor: t.surfaceAlt,
      borderRadius: 12,
      padding: 12,
      color: t.text,
      fontSize: 13,
      fontFamily: "monospace",
      marginBottom: 10,
    },
    helpText: { color: t.textTertiary, fontSize: 12, marginTop: 2 },
    helpLink: { color: t.accent, fontSize: 12, fontWeight: "600", textDecorationLine: "underline" },
    actionRow: { flexDirection: "row", gap: 8, marginTop: 10 },
    testBtn: {
      flex: 1,
      paddingVertical: 10,
      backgroundColor: t.surfaceAlt,
      borderRadius: 999,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
    },
    testBtnText: { color: t.textSecondary, fontSize: 13, fontWeight: "600" },
    saveAllBtn: {
      paddingVertical: 16,
      borderRadius: 999,
      backgroundColor: t.accent,
      alignItems: "center",
      marginBottom: 8,
    },
    saveAllBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  }), [t, isDark]);

  if (!isBusiness) {
    return (
      <UpgradeGate
        requiredPlan="business"
        feature="Slack & Teams Integrations"
        description="Connect Claimio to Slack or Teams to get real-time notifications when claims are submitted, approved, or rejected."
      />
    );
  }

  return (
    <ThemedView style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={t.accent} />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Integrations</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={t.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* intro */}
          <View style={styles.infoCard}>
            <ThemedText style={styles.infoTitle}>Real-time Webhook Notifications</ThemedText>
            <ThemedText style={styles.infoText}>
              Connect Claimio to Slack or Microsoft Teams to receive instant notifications when:{"\n"}
              {"•"} A new expense claim is submitted{"\n"}
              {"•"} A claim is approved or rejected{"\n"}
              {"•"} A claim needs a second approval (L2 review){"\n\n"}
              Uses Incoming Webhooks — no OAuth or admin access required.
            </ThemedText>
          </View>

          {/* slack */}
          <ThemedText style={styles.sectionLabel}>SLACK</ThemedText>
          <View style={styles.card}>
            <TextInput
              style={styles.urlInput}
              value={slackUrl}
              onChangeText={setSlackUrl}
              placeholder="https://hooks.slack.com/services/..."
              placeholderTextColor={t.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TouchableOpacity onPress={() => Linking.openURL("https://api.slack.com/messaging/webhooks")}>
              <ThemedText style={styles.helpLink}>
                How to create a Slack Incoming Webhook →
              </ThemedText>
            </TouchableOpacity>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.testBtn}
                onPress={() => handleTest("slack")}
                disabled={testing !== null}
                activeOpacity={0.7}
              >
                {testing === "slack"
                  ? <ActivityIndicator size="small" color={t.accent} />
                  : <>
                      <Ionicons name="checkmark-circle-outline" size={15} color={t.textSecondary} style={{ marginRight: 6 }} />
                      <ThemedText style={styles.testBtnText}>Test</ThemedText>
                    </>
                }
              </TouchableOpacity>
            </View>
          </View>

          {/* teams */}
          <ThemedText style={styles.sectionLabel}>MICROSOFT TEAMS</ThemedText>
          <View style={styles.card}>
            <TextInput
              style={styles.urlInput}
              value={teamsUrl}
              onChangeText={setTeamsUrl}
              placeholder="https://outlook.office.com/webhook/..."
              placeholderTextColor={t.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TouchableOpacity onPress={() => Linking.openURL("https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook")}>
              <ThemedText style={styles.helpLink}>
                How to create a Teams Incoming Webhook →
              </ThemedText>
            </TouchableOpacity>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.testBtn}
                onPress={() => handleTest("teams")}
                disabled={testing !== null}
                activeOpacity={0.7}
              >
                {testing === "teams"
                  ? <ActivityIndicator size="small" color={t.accent} />
                  : <>
                      <Ionicons name="checkmark-circle-outline" size={15} color={t.textSecondary} style={{ marginRight: 6 }} />
                      <ThemedText style={styles.testBtnText}>Test</ThemedText>
                    </>
                }
              </TouchableOpacity>
            </View>
          </View>

          {/* save */}
          <TouchableOpacity
            style={[styles.saveAllBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <ThemedText style={styles.saveAllBtnText}>Save Integration Settings</ThemedText>
            }
          </TouchableOpacity>

        </ScrollView>
      )}
    </ThemedView>
  );
}
