import { router } from "expo-router";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where
} from "firebase/firestore";
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
import UpgradeGate from "../../components/upgrade-gate";
import { db } from "../firebase/firebaseConfig";
import { useAuth } from "../context/AuthProvider";
import { useTheme } from "../../hooks/useTheme";

type Department = {
  id: string;
  name: string;
  code?: string;
  orgId: string;
};

export default function ManageDepartmentsScreen() {
  const { orgId, isBusiness } = useAuth();
  const { tokens: t } = useTheme();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [newName,     setNewName]     = useState("");
  const [newCode,     setNewCode]     = useState("");

  // load all departments for this org on mount
  useEffect(() => {
    if (!orgId) return;
    getDocs(query(collection(db, "departments"), where("orgId", "==", orgId)))
      .then(snap => {
        const list: Department[] = snap.docs.map(d => ({
          id:    d.id,
          name:  d.data().name,
          code:  d.data().code ?? "",
          orgId: d.data().orgId,
        }));
        setDepartments(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  // create a new department doc
  const handleCreate = async () => {
    const trimmedName = newName.trim();
    const trimmedCode = newCode.trim().toUpperCase().slice(0, 6);
    if (!trimmedName) return;
    if (!isBusiness) {
      Alert.alert("Business Plan Required", "Upgrade to Business to create departments.");
      return;
    }
    if (departments.some(d => d.name.toLowerCase() === trimmedName.toLowerCase())) {
      Alert.alert("Already exists", "A department with this name already exists.");
      return;
    }
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, "departments"), {
        orgId,
        name:      trimmedName,
        code:      trimmedCode,
        createdAt: serverTimestamp(),
      });
      setDepartments(prev => [...prev, { id: ref.id, name: trimmedName, code: trimmedCode, orgId: orgId! }]);
      setNewName("");
      setNewCode("");
    } catch {
      Alert.alert("Error", "Failed to create department. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // confirm then delete a department
  const handleDelete = (dept: Department) => {
    if (!isBusiness) {
      Alert.alert("Business Plan Required", "Upgrade to Business to manage departments.");
      return;
    }
    Alert.alert(
      "Remove Department",
      `Remove ${dept.name}? Existing claims will keep their department tag.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "departments", dept.id));
              setDepartments(prev => prev.filter(d => d.id !== dept.id));
            } catch {
              Alert.alert("Error", "Failed to delete department.");
            }
          }
        }
      ]
    );
  };

  const styles = useMemo(() => StyleSheet.create({
    root:   { flex: 1, backgroundColor: t.bg },
    center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: t.bg },
    scroll: { padding: 20 },

    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 4,
    },
    backBtn:     { paddingVertical: 4 },
    backBtnText: { color: t.textSecondary, fontSize: 15, fontWeight: "600" },
    title:       { color: t.text, fontSize: 28, fontWeight: "800", letterSpacing: -1 },
    subtitle:    { color: t.textSecondary, fontSize: 13, marginBottom: 20, marginTop: 4 },

    // business plan warning banner
    warningBanner: {
      backgroundColor: "#FEF3C7",
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    warningText: { color: "#92400E", fontSize: 13, fontWeight: "600", flex: 1 },

    card: {
      backgroundColor: t.surface,
      borderRadius: 20,
      padding: 18,
      marginBottom: 16,
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

    deptRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      gap: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },
    deptRowLast: { borderBottomWidth: 0 },
    deptName: { flex: 1, color: t.text, fontSize: 14, fontWeight: "500" },
    codeBadge: {
      backgroundColor: t.surfaceAlt,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    codeText: { color: t.textSecondary, fontSize: 12, fontWeight: "600" },
    deleteBtn: {
      width: 28,
      height: 28,
      borderRadius: 999,
      backgroundColor: t.errorSurface,
      alignItems: "center",
      justifyContent: "center",
    },

    addRow: { gap: 10 },
    inputRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
    input: {
      flex: 1,
      backgroundColor: t.surfaceAlt,
      color: t.text,
      paddingHorizontal: 16,
      paddingVertical: 13,
      borderRadius: 999,
      fontSize: 14,
    },
    codeInput: {
      width: 100,
      backgroundColor: t.surfaceAlt,
      color: t.text,
      paddingHorizontal: 16,
      paddingVertical: 13,
      borderRadius: 999,
      fontSize: 14,
      textAlign: "center",
    },
    addBtn: {
      backgroundColor: t.accent,
      paddingHorizontal: 20,
      paddingVertical: 13,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    addBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },

    emptyText: { color: t.textTertiary, fontSize: 13 },
  }), [t]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={t.accent} />
      </SafeAreaView>
    );
  }

  if (!isBusiness) {
    return (
      <SafeAreaView style={styles.root}>
        <UpgradeGate
          requiredPlan="business"
          feature="Departments & Cost Centres"
          description="Group employees into departments, tag every claim with a cost centre, and break down spending by team — all on the Business plan."
          icon="business-outline"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ThemedText style={styles.backBtnText}>← Back</ThemedText>
          </TouchableOpacity>
          <ThemedText type="title" style={styles.title}>Departments</ThemedText>
        </View>
        <ThemedText style={styles.subtitle}>
          Manage cost centres and departments for your organisation
        </ThemedText>

        {/* department list */}
        <View style={styles.card}>
          <ThemedText style={styles.sectionLabel}>Departments</ThemedText>
          <ThemedText style={styles.sectionHint}>
            Assign employees to departments to group and report expenses by cost centre.
          </ThemedText>

          {departments.length === 0 ? (
            <ThemedText style={styles.emptyText}>No departments yet</ThemedText>
          ) : (
            departments.map((dept, i) => (
              <View
                key={dept.id}
                style={[styles.deptRow, i === departments.length - 1 && styles.deptRowLast]}
              >
                <ThemedText style={styles.deptName}>{dept.name}</ThemedText>
                {dept.code ? (
                  <View style={styles.codeBadge}>
                    <ThemedText style={styles.codeText}>{dept.code}</ThemedText>
                  </View>
                ) : null}
                <TouchableOpacity
                  onPress={() => handleDelete(dept)}
                  style={styles.deleteBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={13} color={t.error} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* add new department */}
        <View style={styles.card}>
          <ThemedText style={styles.sectionLabel}>Add Department</ThemedText>
          <View style={styles.addRow}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Department name"
                placeholderTextColor={t.textTertiary}
                value={newName}
                onChangeText={setNewName}
                autoCapitalize="words"
                returnKeyType="next"
              />
              <TextInput
                style={styles.codeInput}
                placeholder="Code"
                placeholderTextColor={t.textTertiary}
                value={newCode}
                onChangeText={v => setNewCode(v.toUpperCase())}
                autoCapitalize="characters"
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={handleCreate}
              />
            </View>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={handleCreate}
              disabled={saving || !newName.trim()}
              activeOpacity={0.8}
            >
              {saving
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <ThemedText style={styles.addBtnText}>Add Department</ThemedText>
              }
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
