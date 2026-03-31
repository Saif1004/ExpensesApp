import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { doc, getDoc } from "firebase/firestore";
import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";
import { IconSymbol } from "../../components/ui/icon-symbol";
import { useAuth } from "../context/AuthProvider";
import { db } from "../firebase/firebaseConfig";

const AZURE_VALIDATE_URL = process.env.EXPO_PUBLIC_AZURE_VALIDATE_URL!;
const AZURE_OCR_URL = process.env.EXPO_PUBLIC_AZURE_OCR_URL!;
const AZURE_UPLOAD_URL = process.env.EXPO_PUBLIC_UPLOAD_URL!;

const DEFAULT_CATEGORIES = ["Meals", "Travel", "Technology", "Office"];

export default function AddExpenseScreen() {
  const { user, orgId } = useAuth();
  const insets = useSafeAreaInsets();

  const [dynamicCategories, setDynamicCategories] = useState<string[]>(DEFAULT_CATEGORIES);

  useEffect(() => {
    if (!orgId) return;

    const fetchCategories = async () => {
      try {
        const snap = await getDoc(doc(db, "orgs", orgId));
        const data = snap.data();
        if (data?.categories && Array.isArray(data.categories) && data.categories.length > 0) {
          setDynamicCategories(data.categories);
        }
      } catch {
        // Fallback to default categories
      }
    };

    fetchCategories();
  }, [orgId]);

  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("Meals");
  const [purchaseDate, setPurchaseDate] = useState("");

  const [receiptUrl, setReceiptUrl] = useState("");
  const [receiptPreview, setReceiptPreview] = useState("");
  const [hasReceipt, setHasReceipt] = useState(false);

  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  const validateDateFormat = (date: string) => {
    return /^\d{4}-\d{2}-\d{2}$/.test(date);
  };

  const clearReceipt = () => {
    setReceiptUrl("");
    setReceiptPreview("");
  };

  const handleReceiptToggle = (value: boolean) => {
    setHasReceipt(value);
    if (!value) clearReceipt();
  };

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== "granted") {
      Alert.alert(
        "Permission required",
        "Camera permission is needed to scan receipts."
      );
      return false;
    }

    return true;
  };

  const requestLibraryPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      Alert.alert(
        "Permission required",
        "Photo library access is required."
      );
      return false;
    }

    return true;
  };

  const pickReceipt = () => {
    Alert.alert("Add Receipt", "Choose image source", [
      { text: "Take Photo", onPress: openCamera },
      { text: "Choose from Library", onPress: openLibrary },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const openCamera = async () => {
    const granted = await requestCameraPermission();
    if (!granted) return;

    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.7,
      allowsEditing: true,
    });

    if (!result.canceled) {
      processReceipt(result.assets[0]);
    }
  };

  const openLibrary = async () => {
    const granted = await requestLibraryPermission();
    if (!granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      base64: true,
      quality: 0.7,
      allowsEditing: true,
    });

    if (!result.canceled) {
      processReceipt(result.assets[0]);
    }
  };

  const processReceipt = async (image: ImagePicker.ImagePickerAsset) => {
    try {
      setOcrLoading(true);

      // Get a fresh Firebase ID token — required by every Azure Function
      if (!user) throw new Error("Not authenticated");
      const idToken = await user.getIdToken();
      const authHeaders = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,
      };

      //////////////////////
      // Upload Receipt
      //////////////////////

      const uploadRes = await fetch(AZURE_UPLOAD_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ image: image.base64 }),
      });

      const uploadData = await uploadRes.json();

      if (!uploadRes.ok || !uploadData.url) {
        throw new Error(uploadData?.error || "Receipt upload failed");
      }

      setReceiptUrl(uploadData.url);
      setReceiptPreview(image.uri);

      //////////////////////
      // OCR
      //////////////////////

      const ocrRes = await fetch(AZURE_OCR_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ image: image.base64 }),
      });

      const data = await ocrRes.json();

      console.log("OCR RESULT:", data);

      if (!ocrRes.ok) {
        throw new Error(data?.error || "OCR failed");
      }

      // Autofill fields safely

      if (data.amount !== null && data.amount !== undefined) {
        setAmount(String(data.amount));
      }

      if (data.merchant) {
        setMerchant(data.merchant);
      }

      if (data.date) {
        setPurchaseDate(data.date);
      }

      if (data.category && dynamicCategories.includes(data.category)) {
        setCategory(data.category);
      }

      setHasReceipt(true);

      Alert.alert("Receipt scanned", "Receipt fields auto-filled.");
    } catch (error: any) {
      Alert.alert("Receipt Error", error?.message ?? "Something went wrong.");
      clearReceipt();
    } finally {
      setOcrLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      Alert.alert("Not logged in");
      return;
    }

    if (!amount || isNaN(Number(amount))) {
      Alert.alert("Invalid amount");
      return;
    }

    if (!merchant.trim()) {
      Alert.alert("Enter merchant");
      return;
    }

    if (!validateDateFormat(purchaseDate)) {
      Alert.alert("Use YYYY-MM-DD date");
      return;
    }

    if (hasReceipt && !receiptUrl) {
      Alert.alert("Receipt missing");
      return;
    }

    try {
      setSaving(true);

      // Get a fresh Firebase ID token — required by every Azure Function
      const idToken = await user.getIdToken();

      const response = await fetch(AZURE_VALIDATE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          amount: Number(amount),
          merchant: merchant.trim(),
          category,
          purchaseDate,
          hasReceipt: !!receiptUrl,
          receiptUrl: receiptUrl || "",
          userId: user.uid,
          userEmail: user.email,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.valid) {
        Alert.alert("Policy violation", result.reason);
        return;
      }

      Alert.alert("Success", "Claim submitted");

      setAmount("");
      setMerchant("");
      setPurchaseDate("");
      setCategory(dynamicCategories[0] ?? "Meals");
      setHasReceipt(false);
      clearReceipt();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          <ThemedView style={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>

            {/* HEADER */}
            <View style={styles.header}>
              <View style={styles.headerIconWrap}>
                <Ionicons name="receipt-outline" size={22} color="#38BDF8" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="title" style={styles.title}>
                  New Expense
                </ThemedText>
                <ThemedText style={styles.subtitle}>
                  AI-validated against your org's policy
                </ThemedText>
              </View>
            </View>

            {/* RECEIPT CARD */}
            <View style={styles.sectionLabel}>
              <Ionicons name="camera-outline" size={14} color="#475569" style={{ marginRight: 6 }} />
              <ThemedText style={styles.sectionLabelText}>RECEIPT</ThemedText>
            </View>

            <ThemedView style={styles.card}>
              <View style={styles.switchRow}>
                <View style={styles.switchLabelRow}>
                  <Ionicons name="attach-outline" size={18} color="#38BDF8" style={{ marginRight: 8 }} />
                  <ThemedText style={styles.switchLabel}>Attach Receipt</ThemedText>
                </View>
                <Switch
                  value={hasReceipt}
                  onValueChange={handleReceiptToggle}
                  trackColor={{ false: "#334155", true: "#2563EB" }}
                  thumbColor={hasReceipt ? "#38BDF8" : "#64748B"}
                />
              </View>

              {hasReceipt &&
                (receiptPreview ? (
                  <TouchableOpacity
                    style={styles.previewWrapper}
                    onPress={() => setShowReceiptModal(true)}
                    onLongPress={clearReceipt}
                  >
                    <Image
                      source={{ uri: receiptPreview }}
                      style={styles.receiptPreview}
                    />
                    <View style={styles.previewBanner}>
                      <Ionicons name="eye-outline" size={14} color="#F8FAFC" style={{ marginRight: 4 }} />
                      <ThemedText style={styles.previewHint}>
                        Tap to view · Long press to remove
                      </ThemedText>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.uploadBox}
                    onPress={pickReceipt}
                  >
                    {ocrLoading ? (
                      <View style={styles.ocrLoading}>
                        <ActivityIndicator color="#38BDF8" size="large" />
                        <ThemedText style={styles.ocrText}>Scanning receipt…</ThemedText>
                      </View>
                    ) : (
                      <>
                        <View style={styles.uploadIconWrap}>
                          <Ionicons name="camera-outline" size={36} color="#38BDF8" />
                        </View>
                        <ThemedText style={styles.uploadTitle}>Scan Receipt</ThemedText>
                        <ThemedText style={styles.uploadSubtitle}>AI auto-fills amount, merchant & date</ThemedText>
                      </>
                    )}
                  </TouchableOpacity>
                ))}
            </ThemedView>

            {/* FORM */}
            <View style={styles.sectionLabel}>
              <Ionicons name="create-outline" size={14} color="#475569" style={{ marginRight: 6 }} />
              <ThemedText style={styles.sectionLabelText}>EXPENSE DETAILS</ThemedText>
            </View>

            <ThemedView style={styles.card}>

              <View style={styles.inputWrapper}>
                <Ionicons name="cash-outline" size={16} color="#475569" style={styles.inputIcon} />
                <TextInput
                  placeholder="Amount (£)"
                  placeholderTextColor="#475569"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons name="storefront-outline" size={16} color="#475569" style={styles.inputIcon} />
                <TextInput
                  placeholder="Merchant name"
                  placeholderTextColor="#475569"
                  value={merchant}
                  onChangeText={setMerchant}
                  style={styles.input}
                />
              </View>

              <TouchableOpacity
                style={[styles.inputWrapper, styles.dropdownTrigger]}
                onPress={() => setShowDropdown(!showDropdown)}
                activeOpacity={0.7}
              >
                <Ionicons name="pricetag-outline" size={16} color="#475569" style={styles.inputIcon} />
                <ThemedText style={styles.dropdownValue}>{category}</ThemedText>
                <Ionicons
                  name={showDropdown ? "chevron-up" : "chevron-down"}
                  size={16}
                  color="#475569"
                />
              </TouchableOpacity>

              {showDropdown && (
                <View style={styles.dropdown}>
                  {dynamicCategories.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.dropdownItem, cat === category && styles.dropdownItemActive]}
                      onPress={() => {
                        setCategory(cat);
                        setShowDropdown(false);
                      }}
                    >
                      <ThemedText style={[styles.dropdownItemText, cat === category && styles.dropdownItemTextActive]}>
                        {cat}
                      </ThemedText>
                      {cat === category && (
                        <Ionicons name="checkmark" size={16} color="#38BDF8" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={styles.inputWrapper}>
                <Ionicons name="calendar-outline" size={16} color="#475569" style={styles.inputIcon} />
                <TextInput
                  placeholder="Purchase date (YYYY-MM-DD)"
                  placeholderTextColor="#475569"
                  value={purchaseDate}
                  onChangeText={setPurchaseDate}
                  style={styles.input}
                />
              </View>

              <TouchableOpacity
                style={[styles.submitButton, saving && styles.submitDisabled]}
                onPress={handleSubmit}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <View style={styles.submitInner}>
                    <Ionicons name="send-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
                    <ThemedText style={styles.submitText}>Submit Claim</ThemedText>
                  </View>
                )}
              </TouchableOpacity>

            </ThemedView>
          </ThemedView>
        </ScrollView>
      </TouchableWithoutFeedback>

      {/* RECEIPT MODAL */}

      <Modal visible={showReceiptModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Image
              source={{ uri: receiptPreview }}
              style={styles.modalImage}
              resizeMode="contain"
            />

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setShowReceiptModal(false)}
            >
              <ThemedText style={{ color: "#fff", fontWeight: "600" }}>
                Close
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    backgroundColor: "#0F172A",
    flex: 1
  },

  /* Header */
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 24
  },
  headerIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#0F2A3D",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    justifyContent: "center",
    alignItems: "center"
  },
  title: {
    fontSize: 24,
    color: "#F8FAFC",
    fontWeight: "800",
    lineHeight: 28
  },
  subtitle: {
    color: "#475569",
    fontSize: 12,
    marginTop: 2
  },

  /* Section labels */
  sectionLabel: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10
  },
  sectionLabelText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2
  },

  /* Cards */
  card: {
    backgroundColor: "#1E293B",
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#334155"
  },

  /* Switch row */
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14
  },
  switchLabelRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  switchLabel: {
    color: "#E2E8F0",
    fontSize: 15,
    fontWeight: "500"
  },

  /* Upload box */
  uploadBox: {
    borderWidth: 1.5,
    borderColor: "#334155",
    borderStyle: "dashed",
    borderRadius: 16,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: "center",
    backgroundColor: "#0F172A"
  },
  uploadIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "#0F2A3D",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#1E3A5F"
  },
  uploadTitle: {
    color: "#38BDF8",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4
  },
  uploadSubtitle: {
    color: "#475569",
    fontSize: 12,
    textAlign: "center"
  },
  ocrLoading: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 12
  },
  ocrText: {
    color: "#38BDF8",
    fontSize: 14,
    fontWeight: "600"
  },

  /* Receipt preview */
  previewWrapper: {
    borderRadius: 12,
    overflow: "hidden"
  },
  receiptPreview: {
    width: "100%",
    height: 180,
    borderRadius: 12
  },
  previewBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 8
  },
  previewHint: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "500"
  },

  /* Form inputs */
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 12,
    marginBottom: 10
  },
  inputIcon: {
    marginRight: 10
  },
  input: {
    flex: 1,
    color: "#F8FAFC",
    fontSize: 15,
    paddingVertical: 13
  },

  /* Dropdown */
  dropdownTrigger: {
    paddingVertical: 13
  },
  dropdownValue: {
    flex: 1,
    color: "#F8FAFC",
    fontSize: 15
  },
  dropdown: {
    backgroundColor: "#0F172A",
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden"
  },
  dropdownItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#334155"
  },
  dropdownItemActive: {
    backgroundColor: "#0D1F3C"
  },
  dropdownItemText: {
    color: "#CBD5E1",
    fontSize: 15
  },
  dropdownItemTextActive: {
    color: "#38BDF8",
    fontWeight: "600"
  },

  /* Submit */
  submitButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 4
  },
  submitDisabled: {
    opacity: 0.6
  },
  submitInner: {
    flexDirection: "row",
    alignItems: "center"
  },
  submitText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16
  },

  /* Modals */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    padding: 20
  },
  modalContent: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#334155"
  },
  modalImage: {
    width: "100%",
    height: 350,
    borderRadius: 12
  },
  closeBtn: {
    marginTop: 16,
    backgroundColor: "#2563EB",
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center"
  }
});