import { router } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "../../components/themed-text";
import { db } from "../firebase/firebaseConfig";
import { useAuth } from "../context/AuthProvider";
import { useTheme } from "../../hooks/useTheme";

const DEFAULT_CATEGORIES = ["Meals", "Travel", "Technology", "Office"];
const DEFAULT_ACCOUNT_CODES: Record<string, string> = {
  "Meals": "420", "Travel": "493", "Technology": "404", "Office": "429",
};

export default function ManageCategoriesScreen() {
  const { orgId, isBusiness } = useAuth();
  const { tokens: t } = useTheme();

  const [categories,    setCategories]    = useState<string[]>([]);
  const [accountCodes,  setAccountCodes]  = useState<Record<string, string>>({});
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [newCategory,   setNewCategory]   = useState("");
  const [editingCode,   setEditingCode]   = useState<Record<string, string>>({});

  //////////////////////////////////////////////////////
  // Load
  //////////////////////////////////////////////////////

  useEffect(() => {
    if (!orgId) return;
    getDoc(doc(db, "organisations", orgId)).then(snap => {
      const data = snap.data() ?? {};
      const cats = Array.isArray(data.categories) && data.categories.length > 0
        ? data.categories
        : [...DEFAULT_CATEGORIES];
      setCategories(cats);
      setAccountCodes(data.categoryAccountCodes ?? {});
      setEditingCode(data.categoryAccountCodes ?? {});
    }).catch(() => {
      setCategories([...DEFAULT_CATEGORIES]);
    }).finally(() => setLoading(false));
  }, [orgId]);

  //////////////////////////////////////////////////////
  // Save helpers
  //////////////////////////////////////////////////////

  const persistAll = async (cats: string[], codes: Record<string, string>) => {
    if (!orgId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "organisations", orgId), {
        categories: cats,
        categoryAccountCodes: codes,
      });
    } catch {
      Alert.alert("Error", "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  //////////////////////////////////////////////////////
  // Add category
  //////////////////////////////////////////////////////

  const handleAdd = async () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (categories.includes(trimmed)) {
      Alert.alert("Already exists", "This category already exists.");
      return;
    }
    const updatedCats = [...categories, trimmed];
    setCategories(updatedCats);
    setNewCategory("");
    await persistAll(updatedCats, editingCode);
  };

  //////////////////////////////////////////////////////
  // Remove category
  //////////////////////////////////////////////////////

  const handleRemove = (cat: string) => {
    Alert.alert("Remove Category", `Remove "${cat}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          const updatedCats  = categories.filter(c => c !== cat);
          const updatedCodes = { ...editingCode };
          delete updatedCodes[cat];
          setCategories(updatedCats);
          setEditingCode(updatedCodes);
          setAccountCodes(updatedCodes);
          await persistAll(updatedCats, updatedCodes);
        }
      }
    ]);
  };

  //////////////////////////////////////////////////////
  // Update account code for a category
  //////////////////////////////////////////////////////

  const handleCodeChange = (cat: string, code: string) => {
    setEditingCode(prev => ({ ...prev, [cat]: code }));
  };

  const handleCodeBlur = async (cat: string) => {
    const trimmed = (editingCode[cat] ?? "").trim();
    const updated = { ...editingCode, [cat]: trimmed };
    setEditingCode(updated);
    setAccountCodes(updated);
    await persistAll(categories, updated);
  };

  //////////////////////////////////////////////////////
  // Styles
  //////////////////////////////////////////////////////

  const styles = useMemo(() => StyleSheet.create({
    root:     { flex: 1, backgroundColor: t.bg },
    center:   { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: t.bg },
    scroll:   { padding: 20 },

    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 4,
    },
    backBtn:     { paddingVertical: 4 },
    backBtnText: { color: t.accent, fontSize: 15, fontWeight: "600" },
    title:       { color: t.text, fontSize: 26, fontWeight: "bold" },
    subtitle:    { color: t.textSecondary, fontSize: 13, marginBottom: 20, marginTop: 4 },

    card: {
      backgroundColor: t.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: t.border,
    },
    sectionLabel: {
      color: t.textSecondary,
      fontSize: 12,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    sectionHint: {
      color: t.textTertiary,
      fontSize: 11,
      marginBottom: 14,
    },

    // Category row
    catRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      gap: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },
    catRowLast: {
      borderBottomWidth: 0,
    },
    catName: {
      flex: 1,
      color: t.text,
      fontSize: 14,
      fontWeight: "500",
    },
    codeInput: {
      width: 80,
      backgroundColor: t.surfaceAlt,
      color: t.text,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
      fontSize: 13,
      textAlign: "center",
    },
    deleteBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: t.errorSurface,
      alignItems: "center",
      justifyContent: "center",
    },

    // Add row
    addRow: {
      flexDirection: "row",
      gap: 10,
      alignItems: "center",
    },
    input: {
      flex: 1,
      backgroundColor: t.surfaceAlt,
      color: t.text,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      fontSize: 14,
    },
    addBtn: {
      backgroundColor: t.accent,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    addBtnText: {
      color: t.accentText,
      fontWeight: "700",
      fontSize: 14,
    },

    emptyText: { color: t.textTertiary, fontSize: 13 },
  }), [t]);

  //////////////////////////////////////////////////////
  // Loading
  //////////////////////////////////////////////////////

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={t.accent} />
      </SafeAreaView>
    );
  }

  //////////////////////////////////////////////////////
  // UI
  //////////////////////////////////////////////////////

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ThemedText style={styles.backBtnText}>← Back</ThemedText>
          </TouchableOpacity>
          <ThemedText type="title" style={styles.title}>Categories</ThemedText>
        </View>
        <ThemedText style={styles.subtitle}>
          Manage expense categories and accounting codes for your organisation
        </ThemedText>

        {/* Category list with account codes */}
        <View style={styles.card}>
          <ThemedText style={styles.sectionLabel}>Categories</ThemedText>
          <ThemedText style={styles.sectionHint}>
            Account codes are used in Xero, QuickBooks and Sage exports. Leave blank to use defaults.
          </ThemedText>

          {categories.length === 0 ? (
            <ThemedText style={styles.emptyText}>No categories yet</ThemedText>
          ) : (
            categories.map((cat, i) => (
              <View
                key={cat}
                style={[styles.catRow, i === categories.length - 1 && styles.catRowLast]}
              >
                <ThemedText style={styles.catName}>{cat}</ThemedText>
                {isBusiness ? (
                  <TextInput
                    style={styles.codeInput}
                    value={editingCode[cat] ?? ""}
                    onChangeText={v => handleCodeChange(cat, v)}
                    onBlur={() => handleCodeBlur(cat)}
                    placeholder={DEFAULT_ACCOUNT_CODES[cat] ?? "Code"}
                    placeholderTextColor={t.textTertiary}
                    keyboardType="numeric"
                    maxLength={10}
                    returnKeyType="done"
                  />
                ) : (
                  <View style={[styles.codeInput, { justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 4 }]}>
                    <Ionicons name="lock-closed" size={10} color={t.textTertiary} />
                    <ThemedText style={{ color: t.textTertiary, fontSize: 11 }}>Business</ThemedText>
                  </View>
                )}
                <TouchableOpacity
                  onPress={() => handleRemove(cat)}
                  style={styles.deleteBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={13} color={t.error} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Add new */}
        <View style={styles.card}>
          <ThemedText style={styles.sectionLabel}>Add Category</ThemedText>
          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              placeholder="Category name"
              placeholderTextColor={t.textTertiary}
              value={newCategory}
              onChangeText={setNewCategory}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleAdd}
            />
            <TouchableOpacity
              style={styles.addBtn}
              onPress={handleAdd}
              disabled={saving || !newCategory.trim()}
              activeOpacity={0.8}
            >
              {saving
                ? <ActivityIndicator color={t.accentText} size="small" />
                : <ThemedText style={styles.addBtnText}>Add</ThemedText>
              }
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
