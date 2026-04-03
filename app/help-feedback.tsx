import { useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "../components/themed-text";
import { useTheme } from "../hooks/useTheme";

const SUPPORT_EMAIL = "support@claimio.org";
const FEEDBACK_EMAIL = "feedback@claimio.org";

type Category = "bug" | "feature" | "general" | "other";

const CATEGORIES: { key: Category; label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; desc: string }[] = [
  { key: "bug",     label: "Bug Report",        icon: "bug-outline",           desc: "Something isn't working right" },
  { key: "feature", label: "Feature Request",   icon: "bulb-outline",          desc: "Suggest an improvement" },
  { key: "general", label: "General Feedback",  icon: "chatbubble-outline",    desc: "Thoughts on your experience" },
  { key: "other",   label: "Other",             icon: "help-circle-outline",   desc: "Anything else" },
];

export default function HelpFeedbackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tokens: t } = useTheme();

  const [category, setCategory] = useState<Category | null>(null);
  const [message, setMessage] = useState("");

  const styles = useMemo(() => StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: t.bg,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },
    headerTitle: {
      color: t.text,
      fontSize: 17,
      fontWeight: "700",
    },
    backBtn: {
      width: 40,
      height: 40,
      justifyContent: "center",
    },
    container: {
      paddingHorizontal: 20,
      paddingTop: 28,
    },
    iconWrap: {
      width: 88,
      height: 88,
      borderRadius: 24,
      backgroundColor: t.accentSurface,
      borderWidth: 1,
      borderColor: t.accent + "55",
      justifyContent: "center",
      alignItems: "center",
      alignSelf: "center",
      marginBottom: 16,
    },
    title: {
      color: t.text,
      fontSize: 24,
      fontWeight: "700",
      textAlign: "center",
      marginBottom: 6,
    },
    subtitle: {
      color: t.textTertiary,
      fontSize: 13,
      textAlign: "center",
      marginBottom: 28,
      lineHeight: 20,
    },
    sectionLabel: {
      color: t.textTertiary,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.4,
      textTransform: "uppercase",
      marginBottom: 10,
      marginLeft: 4,
    },
    categoryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 24,
    },
    categoryChip: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      gap: 8,
      minWidth: "45%",
      flex: 1,
    },
    categoryChipSelected: {
      backgroundColor: t.accentSurface,
      borderColor: t.accent,
    },
    categoryChipText: {
      color: t.textSecondary,
      fontSize: 13,
      fontWeight: "600",
    },
    categoryChipTextSelected: {
      color: t.accent,
    },
    categoryChipDesc: {
      color: t.textTertiary,
      fontSize: 11,
      marginTop: 2,
    },
    chipTextBlock: {
      flex: 1,
    },
    textAreaWrap: {
      backgroundColor: t.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: 24,
      overflow: "hidden",
    },
    textArea: {
      color: t.text,
      fontSize: 14,
      lineHeight: 22,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 14,
      minHeight: 140,
      textAlignVertical: "top",
    },
    charCount: {
      color: t.textTertiary,
      fontSize: 11,
      textAlign: "right",
      paddingHorizontal: 14,
      paddingBottom: 10,
    },
    submitBtn: {
      backgroundColor: t.accent,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: "center",
      marginBottom: 20,
    },
    submitBtnDisabled: {
      opacity: 0.45,
    },
    submitBtnText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "700",
    },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 20,
    },
    dividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.border,
    },
    dividerText: {
      color: t.textTertiary,
      fontSize: 12,
    },
    contactCard: {
      backgroundColor: t.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.border,
      overflow: "hidden",
      marginBottom: 24,
    },
    contactRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 14,
    },
    contactRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },
    contactIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: t.accentSurface,
      justifyContent: "center",
      alignItems: "center",
    },
    contactLabel: {
      color: t.text,
      fontSize: 14,
      fontWeight: "600",
    },
    contactSub: {
      color: t.textSecondary,
      fontSize: 12,
      marginTop: 1,
    },
  }), [t]);

  const handleSend = () => {
    if (!category) {
      Alert.alert("Select a category", "Please choose what type of feedback you're sending.");
      return;
    }
    if (!message.trim()) {
      Alert.alert("Empty message", "Please write something before sending.");
      return;
    }
    const cat = CATEGORIES.find(c => c.key === category);
    const subject = encodeURIComponent(`[Claimio] ${cat?.label ?? "Feedback"}`);
    const body = encodeURIComponent(message.trim());
    const mailto = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
    Linking.openURL(mailto).catch(() =>
      Alert.alert("Could not open email", `Please email us directly at ${FEEDBACK_EMAIL}`)
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={t.accent} />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Help & Feedback</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.iconWrap}>
          <Ionicons name="chatbubble-ellipses" size={44} color={t.accent} />
        </View>
        <ThemedText style={styles.title}>We'd love to hear from you</ThemedText>
        <ThemedText style={styles.subtitle}>
          Report a bug, suggest a feature, or share your thoughts. We read every message.
        </ThemedText>

        {/* Category */}
        <ThemedText style={styles.sectionLabel}>Category</ThemedText>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map(cat => {
            const selected = category === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                onPress={() => setCategory(cat.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={cat.icon}
                  size={18}
                  color={selected ? t.accent : t.textSecondary}
                />
                <View style={styles.chipTextBlock}>
                  <ThemedText style={[styles.categoryChipText, selected && styles.categoryChipTextSelected]}>
                    {cat.label}
                  </ThemedText>
                  <ThemedText style={styles.categoryChipDesc}>{cat.desc}</ThemedText>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Message */}
        <ThemedText style={styles.sectionLabel}>Message</ThemedText>
        <View style={styles.textAreaWrap}>
          <TextInput
            style={styles.textArea}
            value={message}
            onChangeText={setMessage}
            placeholder="Describe the issue or idea in as much detail as you like…"
            placeholderTextColor={t.textTertiary}
            multiline
            maxLength={2000}
            autoCorrect
            spellCheck
          />
          <ThemedText style={styles.charCount}>{message.length}/2000</ThemedText>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, (!category || !message.trim()) && styles.submitBtnDisabled]}
          onPress={handleSend}
          activeOpacity={0.8}
        >
          <ThemedText style={styles.submitBtnText}>Send Feedback</ThemedText>
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <ThemedText style={styles.dividerText}>or contact us directly</ThemedText>
          <View style={styles.dividerLine} />
        </View>

        {/* Direct contact */}
        <View style={styles.contactCard}>
          <TouchableOpacity
            style={[styles.contactRow, styles.contactRowBorder]}
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
            activeOpacity={0.7}
          >
            <View style={styles.contactIconWrap}>
              <Ionicons name="headset-outline" size={18} color={t.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.contactLabel}>Support</ThemedText>
              <ThemedText style={styles.contactSub}>{SUPPORT_EMAIL}</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={t.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.contactRow}
            onPress={() => Linking.openURL(`mailto:${FEEDBACK_EMAIL}`)}
            activeOpacity={0.7}
          >
            <View style={styles.contactIconWrap}>
              <Ionicons name="mail-outline" size={18} color={t.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.contactLabel}>Feedback</ThemedText>
              <ThemedText style={styles.contactSub}>{FEEDBACK_EMAIL}</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={t.textTertiary} />
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}
