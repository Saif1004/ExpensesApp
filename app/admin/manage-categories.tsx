import { router } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
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

import { ThemedText } from "../../components/themed-text";
import { db } from "../firebase/firebaseConfig";
import { useAuth } from "../context/AuthProvider";

const DEFAULT_CATEGORIES = ["Meals", "Travel", "Technology", "Office"];

export default function ManageCategoriesScreen() {
  const { orgId } = useAuth();

  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => {
    if (!orgId) return;

    const fetchCategories = async () => {
      try {
        const snap = await getDoc(doc(db, "orgs", orgId));
        const data = snap.data();
        if (data?.categories && Array.isArray(data.categories) && data.categories.length > 0) {
          setCategories(data.categories);
        } else {
          setCategories([...DEFAULT_CATEGORIES]);
        }
      } catch {
        setCategories([...DEFAULT_CATEGORIES]);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, [orgId]);

  const handleAdd = async () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (categories.includes(trimmed)) {
      Alert.alert("Already exists", "This category already exists.");
      return;
    }

    const updated = [...categories, trimmed];
    setCategories(updated);
    setNewCategory("");
    await saveCategories(updated);
  };

  const handleRemove = async (cat: string) => {
    Alert.alert(
      "Remove Category",
      `Remove "${cat}" from your categories?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const updated = categories.filter((c) => c !== cat);
            setCategories(updated);
            await saveCategories(updated);
          }
        }
      ]
    );
  };

  const saveCategories = async (cats: string[]) => {
    if (!orgId) return;
    try {
      setSaving(true);
      await updateDoc(doc(db, "orgs", orgId), { categories: cats });
    } catch {
      Alert.alert("Error", "Failed to save categories.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#38BDF8" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ThemedText style={styles.backBtnText}>← Back</ThemedText>
          </TouchableOpacity>
          <ThemedText type="title" style={styles.title}>Categories</ThemedText>
        </View>

        <ThemedText style={styles.subtitle}>
          Manage expense categories for your organisation
        </ThemedText>

        {/* Existing categories */}
        <View style={styles.card}>
          <ThemedText style={styles.sectionLabel}>Current Categories</ThemedText>
          <View style={styles.chipsWrap}>
            {categories.map((cat) => (
              <View key={cat} style={styles.chip}>
                <ThemedText style={styles.chipText}>{cat}</ThemedText>
                <TouchableOpacity
                  onPress={() => handleRemove(cat)}
                  style={styles.chipRemove}
                  activeOpacity={0.7}
                >
                  <ThemedText style={styles.chipRemoveText}>✕</ThemedText>
                </TouchableOpacity>
              </View>
            ))}
            {categories.length === 0 && (
              <ThemedText style={styles.emptyText}>No categories yet</ThemedText>
            )}
          </View>
        </View>

        {/* Add new category */}
        <View style={styles.card}>
          <ThemedText style={styles.sectionLabel}>Add Category</ThemedText>
          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              placeholder="Category name"
              placeholderTextColor="#475569"
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
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText style={styles.addBtnText}>Add</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
    padding: 20
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0F172A"
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 6
  },
  backBtn: {
    paddingVertical: 4
  },
  backBtnText: {
    color: "#38BDF8",
    fontSize: 15,
    fontWeight: "600"
  },
  title: {
    color: "#F8FAFC",
    fontSize: 26,
    fontWeight: "bold"
  },
  subtitle: {
    color: "#64748B",
    fontSize: 13,
    marginBottom: 20
  },
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155"
  },
  sectionLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 6
  },
  chipText: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "500"
  },
  chipRemove: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#7F1D1D",
    alignItems: "center",
    justifyContent: "center"
  },
  chipRemoveText: {
    color: "#FCA5A5",
    fontSize: 10,
    fontWeight: "700"
  },
  emptyText: {
    color: "#475569",
    fontSize: 13
  },
  addRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center"
  },
  input: {
    flex: 1,
    backgroundColor: "#0F172A",
    color: "#F8FAFC",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    fontSize: 14
  },
  addBtn: {
    backgroundColor: "#38BDF8",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  addBtnText: {
    color: "#0F172A",
    fontWeight: "700",
    fontSize: 14
  }
});
