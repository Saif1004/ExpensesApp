import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
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

import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";
import { IconSymbol } from "../../components/ui/icon-symbol";
import { useAuth } from "../context/AuthProvider";
import { useTheme } from "../../hooks/useTheme";

const AZURE_VALIDATE_URL = process.env.EXPO_PUBLIC_AZURE_VALIDATE_URL!;
const AZURE_OCR_URL = process.env.EXPO_PUBLIC_AZURE_OCR_URL!;
const AZURE_UPLOAD_URL = process.env.EXPO_PUBLIC_UPLOAD_URL!;

const DEFAULT_CATEGORIES = ["Meals", "Travel", "Technology", "Office"];

export default function AddExpenseScreen() {
  const { user, orgCategories } = useAuth();
  const insets = useSafeAreaInsets();
  const { tokens: t, mode } = useTheme();
  const isDark = mode === "dark";

  // fall back to defaults if the org hasn't set custom categories yet
  const dynamicCategories = orgCategories.length > 0 ? orgCategories : DEFAULT_CATEGORIES;

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

      // fresh token for the azure function calls
      if (!user) throw new Error("Not authenticated");
      const idToken = await user.getIdToken();
      const authHeaders = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,
      };

      // upload the image first so we have a url for the claim

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

      // now run OCR to extract the receipt data

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

      // autofill whatever the OCR found

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

      // fresh token for the validate call
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

  const styles = useMemo(() => StyleSheet.create({
    container: {
      paddingHorizontal: 20,
      backgroundColor: t.bg,
      flex: 1
    },

    // header
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      marginBottom: 28
    },
    headerIconWrap: {
      width: 48,
      height: 48,
      borderRadius: 999,
      backgroundColor: t.accentSurface,
      justifyContent: "center",
      alignItems: "center"
    },
    title: {
      fontSize: 28,
      color: t.text,
      fontWeight: "800",
      letterSpacing: -1,
      lineHeight: 34
    },
    subtitle: {
      color: t.textTertiary,
      fontSize: 12,
      marginTop: 2
    },

    // section labels
    sectionLabel: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 10
    },
    sectionLabelText: {
      color: t.textTertiary,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase"
    },

    // cards
    card: {
      backgroundColor: t.surface,
      padding: 18,
      borderRadius: 20,
      marginBottom: 22,
      ...(isDark ? {} : {
        shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07, shadowRadius: 10, elevation: 3
      })
    },

    // receipt toggle switch
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
      color: t.text,
      fontSize: 15,
      fontWeight: "600"
    },

    // upload/scan box
    uploadBox: {
      borderWidth: 1.5,
      borderColor: t.border,
      borderStyle: "dashed",
      borderRadius: 16,
      paddingVertical: 32,
      paddingHorizontal: 20,
      alignItems: "center",
      backgroundColor: t.surfaceAlt
    },
    uploadIconWrap: {
      width: 64,
      height: 64,
      borderRadius: 999,
      backgroundColor: t.accentSurface,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 14,
    },
    uploadTitle: {
      color: t.text,
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 4
    },
    uploadSubtitle: {
      color: t.textTertiary,
      fontSize: 12,
      textAlign: "center"
    },
    ocrLoading: {
      alignItems: "center",
      paddingVertical: 20,
      gap: 12
    },
    ocrText: {
      color: t.textSecondary,
      fontSize: 14,
      fontWeight: "600"
    },

    // receipt preview once scanned
    previewWrapper: {
      borderRadius: 14,
      overflow: "hidden"
    },
    receiptPreview: {
      width: "100%",
      height: 180,
      borderRadius: 14
    },
    previewBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.6)",
      paddingVertical: 8
    },
    previewHint: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "500"
    },

    // form input fields
    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.surfaceAlt,
      borderRadius: 999,
      paddingHorizontal: 16,
      marginBottom: 10
    },
    inputIcon: {
      marginRight: 10
    },
    input: {
      flex: 1,
      color: t.text,
      fontSize: 15,
      paddingVertical: 14
    },

    // category dropdown
    dropdownTrigger: {
      paddingVertical: 14
    },
    dropdownValue: {
      flex: 1,
      color: t.text,
      fontSize: 15
    },
    dropdown: {
      backgroundColor: t.surfaceAlt,
      borderRadius: 16,
      marginBottom: 10,
      overflow: "hidden"
    },
    dropdownItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border
    },
    dropdownItemActive: {
      backgroundColor: t.accentSurface
    },
    dropdownItemText: {
      color: t.text,
      fontSize: 15
    },
    dropdownItemTextActive: {
      color: t.accent,
      fontWeight: "700"
    },

    // submit button
    submitButton: {
      backgroundColor: t.accent,
      paddingVertical: 16,
      borderRadius: 999,
      alignItems: "center",
      marginTop: 6
    },
    submitDisabled: {
      opacity: 0.5
    },
    submitInner: {
      flexDirection: "row",
      alignItems: "center"
    },
    submitText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 16,
      letterSpacing: -0.2
    },

    // modals
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.85)",
      justifyContent: "center",
      padding: 20
    },
    modalContent: {
      backgroundColor: t.surface,
      borderRadius: 24,
      padding: 16,
    },
    modalImage: {
      width: "100%",
      height: 350,
      borderRadius: 16
    },
    closeBtn: {
      marginTop: 14,
      backgroundColor: t.accent,
      paddingVertical: 14,
      borderRadius: 999,
      alignItems: "center"
    }
  }), [t, isDark]);

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

            {/* header */}
            <View style={styles.header}>
              <View style={styles.headerIconWrap}>
                <Ionicons name="receipt-outline" size={22} color={t.accent} />
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

            {/* receipt section */}
            <View style={styles.sectionLabel}>
              <Ionicons name="camera-outline" size={14} color={t.textTertiary} style={{ marginRight: 6 }} />
              <ThemedText style={styles.sectionLabelText}>RECEIPT</ThemedText>
            </View>

            <ThemedView style={styles.card}>
              <View style={styles.switchRow}>
                <View style={styles.switchLabelRow}>
                  <Ionicons name="attach-outline" size={18} color={t.accent} style={{ marginRight: 8 }} />
                  <ThemedText style={styles.switchLabel}>Attach Receipt</ThemedText>
                </View>
                <Switch
                  value={hasReceipt}
                  onValueChange={handleReceiptToggle}
                  trackColor={{ false: t.border, true: t.accent }}
                  thumbColor={hasReceipt ? "#FFFFFF" : "#FFFFFF"}
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
                      <Ionicons name="eye-outline" size={14} color={t.text} style={{ marginRight: 4 }} />
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
                        <ActivityIndicator color={t.accent} size="large" />
                        <ThemedText style={styles.ocrText}>Scanning receipt…</ThemedText>
                      </View>
                    ) : (
                      <>
                        <View style={styles.uploadIconWrap}>
                          <Ionicons name="camera-outline" size={36} color={t.accent} />
                        </View>
                        <ThemedText style={styles.uploadTitle}>Scan Receipt</ThemedText>
                        <ThemedText style={styles.uploadSubtitle}>AI auto-fills amount, merchant & date</ThemedText>
                      </>
                    )}
                  </TouchableOpacity>
                ))}
            </ThemedView>

            {/* expense details form */}
            <View style={styles.sectionLabel}>
              <Ionicons name="create-outline" size={14} color={t.textTertiary} style={{ marginRight: 6 }} />
              <ThemedText style={styles.sectionLabelText}>EXPENSE DETAILS</ThemedText>
            </View>

            <ThemedView style={styles.card}>

              <View style={styles.inputWrapper}>
                <Ionicons name="cash-outline" size={16} color={t.textTertiary} style={styles.inputIcon} />
                <TextInput
                  placeholder="Amount (£)"
                  placeholderTextColor={t.textTertiary}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons name="storefront-outline" size={16} color={t.textTertiary} style={styles.inputIcon} />
                <TextInput
                  placeholder="Merchant name"
                  placeholderTextColor={t.textTertiary}
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
                <Ionicons name="pricetag-outline" size={16} color={t.textTertiary} style={styles.inputIcon} />
                <ThemedText style={styles.dropdownValue}>{category}</ThemedText>
                <Ionicons
                  name={showDropdown ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={t.textTertiary}
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
                        <Ionicons name="checkmark" size={16} color={t.accent} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={styles.inputWrapper}>
                <Ionicons name="calendar-outline" size={16} color={t.textTertiary} style={styles.inputIcon} />
                <TextInput
                  placeholder="Purchase date (YYYY-MM-DD)"
                  placeholderTextColor={t.textTertiary}
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
                  <ActivityIndicator color={t.accentText} />
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

      {/* fullscreen receipt modal */}
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
              <ThemedText style={{ color: "#fff", fontWeight: "700" }}>
                Close
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
