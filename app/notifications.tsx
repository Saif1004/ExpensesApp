import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { TouchableOpacity } from "react-native";

import { auth, db } from "./firebase/firebaseConfig";
import { ThemedText } from "../components/themed-text";
import { useTheme } from "../hooks/useTheme";

//////////////////////////////////////////////////////
// Types
//////////////////////////////////////////////////////

type Prefs = {
  notifPushEnabled: boolean;
  notifEmailEnabled: boolean;
};

//////////////////////////////////////////////////////
// Screen
//////////////////////////////////////////////////////

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tokens: t } = useTheme();
  const user = auth.currentUser;

  const [prefs, setPrefs] = useState<Prefs>({ notifPushEnabled: true, notifEmailEnabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  //////////////////////////////////////////////////////
  // Load prefs
  //////////////////////////////////////////////////////

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    getDoc(doc(db, "users", user.uid)).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        setPrefs({
          notifPushEnabled:  data.notifPushEnabled  !== false,
          notifEmailEnabled: data.notifEmailEnabled !== false,
        });
      }
    }).finally(() => setLoading(false));
  }, []);

  //////////////////////////////////////////////////////
  // Toggle handler
  //////////////////////////////////////////////////////

  const toggle = async (key: keyof Prefs) => {
    if (!user || saving) return;
    const next = !prefs[key];
    setPrefs(prev => ({ ...prev, [key]: next }));
    setSaving(key);
    try {
      await updateDoc(doc(db, "users", user.uid), { [key]: next });
    } catch {
      // revert on failure
      setPrefs(prev => ({ ...prev, [key]: !next }));
    } finally {
      setSaving(null);
    }
  };

  //////////////////////////////////////////////////////
  // Styles
  //////////////////////////////////////////////////////

  const styles = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },

    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
      gap: 8,
    },

    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: t.surface,
      justifyContent: "center",
      alignItems: "center",
    },

    headerTitle: {
      color: t.text,
      fontSize: 18,
      fontWeight: "700",
      flex: 1,
    },

    container: {
      paddingHorizontal: 20,
      paddingTop: 12,
    },

    sectionHeader: {
      color: t.textTertiary,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.4,
      textTransform: "uppercase",
      marginBottom: 8,
      marginTop: 4,
      marginLeft: 4,
    },

    card: {
      backgroundColor: t.surface,
      borderRadius: t.radius.lg,
      marginBottom: 24,
      overflow: "hidden",
    },

    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 15,
      gap: 14,
    },

    rowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },

    iconWrap: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: t.surfaceAlt,
      justifyContent: "center",
      alignItems: "center",
    },

    labelBlock: { flex: 1, gap: 2 },

    label: {
      color: t.text,
      fontSize: 15,
      fontWeight: "500",
    },

    sublabel: {
      color: t.textSecondary,
      fontSize: 12,
    },

    hint: {
      color: t.textTertiary,
      fontSize: 12,
      lineHeight: 18,
      marginHorizontal: 4,
      marginBottom: 24,
    },

    loading: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: t.bg,
    },
  }), [t]);

  //////////////////////////////////////////////////////
  // Loading
  //////////////////////////////////////////////////////

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={t.accent} />
      </View>
    );
  }

  //////////////////////////////////////////////////////
  // UI
  //////////////////////////////////////////////////////

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={18} color={t.text} />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Notifications</ThemedText>
      </View>

      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* Push */}
        <ThemedText style={styles.sectionHeader}>PUSH NOTIFICATIONS</ThemedText>
        <View style={styles.card}>
          <View style={[styles.row]}>
            <View style={styles.iconWrap}>
              <Ionicons name="notifications-outline" size={18} color={t.accent} />
            </View>
            <View style={styles.labelBlock}>
              <ThemedText style={styles.label}>Push Notifications</ThemedText>
              <ThemedText style={styles.sublabel}>
                {prefs.notifPushEnabled ? "Enabled" : "Disabled"}
              </ThemedText>
            </View>
            {saving === "notifPushEnabled"
              ? <ActivityIndicator size="small" color={t.accent} />
              : <Switch
                  value={prefs.notifPushEnabled}
                  onValueChange={() => toggle("notifPushEnabled")}
                  trackColor={{ false: t.border, true: t.accent }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={t.border}
                />
            }
          </View>
        </View>
        <ThemedText style={styles.hint}>
          Receive alerts on your device for claim updates, join requests, and membership changes.
        </ThemedText>

        {/* Email */}
        <ThemedText style={styles.sectionHeader}>EMAIL NOTIFICATIONS</ThemedText>
        <View style={styles.card}>
          <View style={[styles.row]}>
            <View style={styles.iconWrap}>
              <Ionicons name="mail-outline" size={18} color={t.accent} />
            </View>
            <View style={styles.labelBlock}>
              <ThemedText style={styles.label}>Email Notifications</ThemedText>
              <ThemedText style={styles.sublabel}>
                {prefs.notifEmailEnabled ? "Enabled" : "Disabled"}
              </ThemedText>
            </View>
            {saving === "notifEmailEnabled"
              ? <ActivityIndicator size="small" color={t.accent} />
              : <Switch
                  value={prefs.notifEmailEnabled}
                  onValueChange={() => toggle("notifEmailEnabled")}
                  trackColor={{ false: t.border, true: t.accent }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={t.border}
                />
            }
          </View>
        </View>
        <ThemedText style={styles.hint}>
          Receive email summaries at your registered address for the same events.
        </ThemedText>

      </ScrollView>
    </SafeAreaView>
  );
}
