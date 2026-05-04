import { usePostHog } from "posthog-react-native";
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
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";

import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";
import { IconSymbol } from "../../components/ui/icon-symbol";
import { useAuth } from "../context/AuthProvider";
import { useTheme } from "../../hooks/useTheme";
import { db } from "../firebase/firebaseConfig";

const AZURE_VALIDATE_URL = process.env.EXPO_PUBLIC_AZURE_VALIDATE_URL!;
const AZURE_OCR_URL = process.env.EXPO_PUBLIC_AZURE_OCR_URL!;
const AZURE_UPLOAD_URL = process.env.EXPO_PUBLIC_UPLOAD_URL!;

const DEFAULT_CATEGORIES = ["Meals", "Travel", "Technology", "Office"];

type ClaimType = "receipt" | "mileage" | "perdiem";

type Template = {
  id: string;
  name: string;
  merchant: string;
  amount: string;
  category: string;
};

export default function AddExpenseScreen() {
  const { user, orgCategories } = useAuth();
  const posthog = usePostHog();
  const insets = useSafeAreaInsets();
  const { tokens: t, mode } = useTheme();
  const isDark = mode === "dark";

  // fall back to defaults if the org hasn't set custom categories yet
  const dynamicCategories = orgCategories.length > 0 ? orgCategories : DEFAULT_CATEGORIES;

  // ── claim type ──────────────────────────────────────────────────────────────
  const [claimType, setClaimType] = useState<ClaimType>("receipt");

  // ── receipt form ────────────────────────────────────────────────────────────
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("Meals");
  const [purchaseDate, setPurchaseDate] = useState("");

  const [receiptUrl, setReceiptUrl] = useState("");
  const [receiptPreview, setReceiptPreview] = useState("");
  const [hasReceipt, setHasReceipt] = useState(false);

  // ── mileage form ────────────────────────────────────────────────────────────
  const [mileageFrom, setMileageFrom] = useState("");
  const [mileageTo, setMileageTo] = useState("");
  const [mileageDistance, setMileageDistance] = useState("");
  const [mileagePurpose, setMileagePurpose] = useState("");

  // ── per diem form ───────────────────────────────────────────────────────────
  const [perDiemDestination, setPerDiemDestination] = useState("");
  const [perDiemDays, setPerDiemDays] = useState("");

  // ── templates ───────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<Template[]>([]);

  // ── ui state ─────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── derived calculated amounts ───────────────────────────────────────────────
  const mileageCalculated = (parseFloat(mileageDistance || "0") * 0.45).toFixed(2);
  const perDiemCalculated = (parseFloat(perDiemDays || "0") * 25).toFixed(2);

  // keep amount state in sync with mileage/per diem calculations
  useEffect(() => {
    if (claimType === "mileage") {
      setAmount(mileageCalculated);
    }
  }, [mileageDistance, claimType]);

  useEffect(() => {
    if (claimType === "perdiem") {
      setAmount(perDiemCalculated);
    }
  }, [perDiemDays, claimType]);

  // when switching claim type reset amount to avoid stale values
  const handleClaimTypeChange = (type: ClaimType) => {
    setClaimType(type);
    if (type === "receipt") {
      setAmount("");
    } else if (type === "mileage") {
      setAmount(mileageCalculated);
      setCategory("Travel");
    } else if (type === "perdiem") {
      setAmount(perDiemCalculated);
      setCategory("Travel");
    }
  };

  // ── template helpers ─────────────────────────────────────────────────────────
  const loadTemplates = async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, "expenseTemplates"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      const loaded: Template[] = snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        merchant: d.data().merchant,
        amount: String(d.data().amount),
        category: d.data().category,
      }));
      setTemplates(loaded);
    } catch (e) {
      // silently ignore — templates are non-critical
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [user]);

  const applyTemplate = (tpl: Template) => {
    setMerchant(tpl.merchant);
    setAmount(tpl.amount);
    setCategory(tpl.category);
  };

  const saveTemplate = async (templateName: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, "expenseTemplates"), {
        userId: user.uid,
        name: templateName,
        merchant: merchant.trim(),
        amount,
        category,
        createdAt: serverTimestamp(),
      });
      posthog?.capture("template_saved");
      await loadTemplates();
    } catch (e: any) {
      Alert.alert("Error", "Could not save template.");
    }
  };

  const promptSaveTemplate = () => {
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Name this template",
        "Give this template a short name for quick access.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Save",
            onPress: (name) => {
              const finalName = name?.trim() || merchant.trim() || "Template";
              saveTemplate(finalName);
            },
          },
        ],
        "plain-text",
        merchant.trim()
      );
    } else {
      // Alert.prompt is iOS-only — use merchant name on Android
      saveTemplate(merchant.trim() || "Template");
    }
  };

  const deleteTemplate = (tpl: Template) => {
    Alert.alert("Delete Template", "Remove this template?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "expenseTemplates", tpl.id));
            await loadTemplates();
          } catch {
            Alert.alert("Error", "Could not delete template.");
          }
        },
      },
    ]);
  };

  // ── receipt helpers ──────────────────────────────────────────────────────────
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

      const filledFields = [
        data.amount !== null && data.amount !== undefined ? "amount" : null,
        data.merchant ? "merchant" : null,
        data.date ? "date" : null,
        data.category ? "category" : null,
      ].filter(Boolean);
      posthog?.capture("receipt_scanned", { fields_autofilled: filledFields.length });

      Alert.alert("Receipt scanned", "Receipt fields auto-filled.");
    } catch (error: any) {
      posthog?.capture("receipt_scan_failed");
      Alert.alert("Receipt Error", error?.message ?? "Something went wrong.");
      clearReceipt();
    } finally {
      setOcrLoading(false);
    }
  };

  // ── submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitError(null);
    if (!user) {
      Alert.alert("Not logged in");
      return;
    }

    // type-specific validation
    if (claimType === "mileage") {
      if (!mileagePurpose.trim()) {
        Alert.alert("Enter a purpose / description");
        return;
      }
      if (!parseFloat(mileageDistance) || parseFloat(mileageDistance) <= 0) {
        Alert.alert("Enter a valid distance");
        return;
      }
    } else if (claimType === "perdiem") {
      if (!perDiemDestination.trim()) {
        Alert.alert("Enter a destination");
        return;
      }
      if (!parseFloat(perDiemDays) || parseFloat(perDiemDays) <= 0) {
        Alert.alert("Enter a valid number of days");
        return;
      }
    } else {
      // receipt mode
      if (!amount || isNaN(Number(amount))) {
        Alert.alert("Invalid amount");
        return;
      }

      if (!merchant.trim()) {
        Alert.alert("Enter merchant");
        return;
      }

      if (hasReceipt && !receiptUrl) {
        Alert.alert("Receipt missing");
        return;
      }
    }

    if (!validateDateFormat(purchaseDate)) {
      Alert.alert("Use YYYY-MM-DD date");
      return;
    }

    try {
      setSaving(true);

      // fresh token for the validate call
      const idToken = await user.getIdToken();

      // build the effective merchant and amount for mileage/perdiem
      const effectiveMerchant =
        claimType === "mileage"
          ? mileagePurpose.trim()
          : claimType === "perdiem"
          ? perDiemDestination.trim()
          : merchant.trim();

      const effectiveAmount =
        claimType === "mileage"
          ? parseFloat(mileageCalculated)
          : claimType === "perdiem"
          ? parseFloat(perDiemCalculated)
          : Number(amount);

      const body: Record<string, unknown> = {
        amount: effectiveAmount,
        merchant: effectiveMerchant,
        category: claimType !== "receipt" ? "Travel" : category,
        purchaseDate,
        hasReceipt: claimType === "receipt" ? !!receiptUrl : false,
        receiptUrl: claimType === "receipt" ? receiptUrl || "" : "",
        userId: user.uid,
        userEmail: user.email,
        claimType,
      };

      if (claimType === "mileage") {
        body.mileageFrom = mileageFrom.trim();
        body.mileageTo = mileageTo.trim();
        body.mileageDistance = parseFloat(mileageDistance);
      }

      if (claimType === "perdiem") {
        body.perDiemDays = parseFloat(perDiemDays);
        body.perDiemDestination = perDiemDestination.trim();
      }

      const response = await fetch(AZURE_VALIDATE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!response.ok || !result.valid) {
        posthog?.capture("expense_submission_failed", { reason: result.reason });
        setSubmitError(result.reason ?? "Your claim could not be submitted. Please check the details and try again.");
        return;
      }

      // clear any previous error on success
      setSubmitError(null);

      if (claimType === "mileage") {
        posthog?.capture("mileage_claim_submitted", { distance: mileageDistance });
      } else if (claimType === "perdiem") {
        posthog?.capture("perdiem_claim_submitted", { days: perDiemDays });
      } else {
        posthog?.capture("expense_submitted", {
          amount: Number(amount),
          category,
          has_receipt: !!receiptUrl,
        });
      }

      Alert.alert("Success", "Claim submitted");

      // reset form
      setAmount("");
      setMerchant("");
      setPurchaseDate("");
      setCategory(dynamicCategories[0] ?? "Meals");
      setHasReceipt(false);
      clearReceipt();
      setMileageFrom("");
      setMileageTo("");
      setMileageDistance("");
      setMileagePurpose("");
      setPerDiemDestination("");
      setPerDiemDays("");

      // offer to save a template (receipt mode only)
      if (claimType === "receipt") {
        Alert.alert(
          "Save as Template?",
          "Save this expense as a quick-fill template for future claims.",
          [
            { text: "Not now", style: "cancel" },
            { text: "Save", onPress: () => promptSaveTemplate() },
          ]
        );
      }
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  // ── styles ───────────────────────────────────────────────────────────────────
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

    // claim type pill selector
    claimTypeRow: {
      flexDirection: "row",
      backgroundColor: t.surfaceAlt,
      borderRadius: 999,
      padding: 4,
      marginBottom: 22,
    },
    claimTypeTab: {
      flex: 1,
      paddingVertical: 9,
      alignItems: "center",
      borderRadius: 999,
    },
    claimTypeTabActive: {
      backgroundColor: t.accent,
    },
    claimTypeTabText: {
      fontSize: 13,
      fontWeight: "600",
      color: t.textSecondary,
    },
    claimTypeTabTextActive: {
      color: "#FFFFFF",
    },

    // templates
    templatesScroll: {
      marginBottom: 22,
    },
    templateChip: {
      backgroundColor: t.surface,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 7,
      marginRight: 8,
      ...(isDark ? {} : {
        shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06, shadowRadius: 4, elevation: 2
      })
    },
    templateChipText: {
      color: t.text,
      fontSize: 13,
      fontWeight: "600",
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

    // calculated amount display
    calcRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.accentSurface,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 13,
      marginBottom: 10,
      gap: 8,
    },
    calcText: {
      color: t.accent,
      fontSize: 15,
      fontWeight: "700",
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
    errorBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor: "#FEF2F2",
      borderWidth: 1,
      borderColor: "#FECACA",
      borderRadius: 12,
      padding: 12,
      marginTop: 10,
      marginBottom: 4,
    },
    errorBannerText: {
      color: "#DC2626",
      fontSize: 13,
      lineHeight: 18,
      flex: 1,
      fontWeight: "500",
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

  // ── submit button label ───────────────────────────────────────────────────────
  const submitLabel =
    claimType === "mileage"
      ? "Submit Mileage Claim"
      : claimType === "perdiem"
      ? "Submit Per Diem Claim"
      : "Submit Claim";

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

            {/* claim type selector */}
            <View style={styles.claimTypeRow}>
              {(["receipt", "mileage", "perdiem"] as ClaimType[]).map((type) => {
                const label = type === "receipt" ? "Receipt" : type === "mileage" ? "Mileage" : "Per Diem";
                const isActive = claimType === type;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[styles.claimTypeTab, isActive && styles.claimTypeTabActive]}
                    onPress={() => handleClaimTypeChange(type)}
                    activeOpacity={0.8}
                  >
                    <ThemedText style={[styles.claimTypeTabText, isActive && styles.claimTypeTabTextActive]}>
                      {label}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* templates (receipt mode, when templates exist) */}
            {claimType === "receipt" && templates.length > 0 && (
              <>
                <View style={styles.sectionLabel}>
                  <Ionicons name="bookmark-outline" size={14} color={t.textTertiary} style={{ marginRight: 6 }} />
                  <ThemedText style={styles.sectionLabelText}>QUICK FILL</ThemedText>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.templatesScroll}
                  contentContainerStyle={{ paddingBottom: 4 }}
                >
                  {templates.map((tpl) => (
                    <TouchableOpacity
                      key={tpl.id}
                      style={styles.templateChip}
                      onPress={() => applyTemplate(tpl)}
                      onLongPress={() => deleteTemplate(tpl)}
                      activeOpacity={0.75}
                    >
                      <ThemedText style={styles.templateChipText}>{tpl.name}</ThemedText>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* ── receipt mode ── */}
            {claimType === "receipt" && (
              <>
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

                  {submitError && (
                    <View style={styles.errorBanner}>
                      <Ionicons name="alert-circle" size={16} color="#DC2626" style={{ marginRight: 8, marginTop: 1 }} />
                      <ThemedText style={styles.errorBannerText}>{submitError}</ThemedText>
                      <TouchableOpacity onPress={() => setSubmitError(null)} style={{ marginLeft: 8 }}>
                        <Ionicons name="close" size={16} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  )}

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
                        <ThemedText style={styles.submitText}>{submitLabel}</ThemedText>
                      </View>
                    )}
                  </TouchableOpacity>
                </ThemedView>
              </>
            )}

            {/* ── mileage mode ── */}
            {claimType === "mileage" && (
              <>
                <View style={styles.sectionLabel}>
                  <Ionicons name="car-outline" size={14} color={t.textTertiary} style={{ marginRight: 6 }} />
                  <ThemedText style={styles.sectionLabelText}>MILEAGE DETAILS</ThemedText>
                </View>

                <ThemedView style={styles.card}>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="navigate-outline" size={16} color={t.textTertiary} style={styles.inputIcon} />
                    <TextInput
                      placeholder="From (e.g. Manchester)"
                      placeholderTextColor={t.textTertiary}
                      value={mileageFrom}
                      onChangeText={setMileageFrom}
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.inputWrapper}>
                    <Ionicons name="location-outline" size={16} color={t.textTertiary} style={styles.inputIcon} />
                    <TextInput
                      placeholder="To (e.g. London)"
                      placeholderTextColor={t.textTertiary}
                      value={mileageTo}
                      onChangeText={setMileageTo}
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.inputWrapper}>
                    <Ionicons name="speedometer-outline" size={16} color={t.textTertiary} style={styles.inputIcon} />
                    <TextInput
                      placeholder="Distance (miles)"
                      placeholderTextColor={t.textTertiary}
                      value={mileageDistance}
                      onChangeText={setMileageDistance}
                      keyboardType="decimal-pad"
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.calcRow}>
                    <Ionicons name="calculator-outline" size={16} color={t.accent} />
                    <ThemedText style={styles.calcText}>
                      Calculated: £{mileageCalculated}
                    </ThemedText>
                    <ThemedText style={{ color: t.textTertiary, fontSize: 12, marginLeft: 4 }}>
                      (45p/mile HMRC)
                    </ThemedText>
                  </View>

                  <View style={styles.inputWrapper}>
                    <Ionicons name="document-text-outline" size={16} color={t.textTertiary} style={styles.inputIcon} />
                    <TextInput
                      placeholder="Purpose / Description"
                      placeholderTextColor={t.textTertiary}
                      value={mileagePurpose}
                      onChangeText={setMileagePurpose}
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.inputWrapper}>
                    <Ionicons name="calendar-outline" size={16} color={t.textTertiary} style={styles.inputIcon} />
                    <TextInput
                      placeholder="Journey date (YYYY-MM-DD)"
                      placeholderTextColor={t.textTertiary}
                      value={purchaseDate}
                      onChangeText={setPurchaseDate}
                      style={styles.input}
                    />
                  </View>

                  {submitError && (
                    <View style={styles.errorBanner}>
                      <Ionicons name="alert-circle" size={16} color="#DC2626" style={{ marginRight: 8, marginTop: 1 }} />
                      <ThemedText style={styles.errorBannerText}>{submitError}</ThemedText>
                      <TouchableOpacity onPress={() => setSubmitError(null)} style={{ marginLeft: 8 }}>
                        <Ionicons name="close" size={16} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  )}

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
                        <Ionicons name="car-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
                        <ThemedText style={styles.submitText}>{submitLabel}</ThemedText>
                      </View>
                    )}
                  </TouchableOpacity>
                </ThemedView>
              </>
            )}

            {/* ── per diem mode ── */}
            {claimType === "perdiem" && (
              <>
                <View style={styles.sectionLabel}>
                  <Ionicons name="bed-outline" size={14} color={t.textTertiary} style={{ marginRight: 6 }} />
                  <ThemedText style={styles.sectionLabelText}>PER DIEM DETAILS</ThemedText>
                </View>

                <ThemedView style={styles.card}>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="earth-outline" size={16} color={t.textTertiary} style={styles.inputIcon} />
                    <TextInput
                      placeholder="Destination"
                      placeholderTextColor={t.textTertiary}
                      value={perDiemDestination}
                      onChangeText={setPerDiemDestination}
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.inputWrapper}>
                    <Ionicons name="today-outline" size={16} color={t.textTertiary} style={styles.inputIcon} />
                    <TextInput
                      placeholder="Number of days"
                      placeholderTextColor={t.textTertiary}
                      value={perDiemDays}
                      onChangeText={setPerDiemDays}
                      keyboardType="decimal-pad"
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.calcRow}>
                    <Ionicons name="calculator-outline" size={16} color={t.accent} />
                    <ThemedText style={styles.calcText}>
                      Calculated: £{perDiemCalculated}
                    </ThemedText>
                    <ThemedText style={{ color: t.textTertiary, fontSize: 12, marginLeft: 4 }}>
                      (£25/day)
                    </ThemedText>
                  </View>

                  <View style={styles.inputWrapper}>
                    <Ionicons name="calendar-outline" size={16} color={t.textTertiary} style={styles.inputIcon} />
                    <TextInput
                      placeholder="Start date (YYYY-MM-DD)"
                      placeholderTextColor={t.textTertiary}
                      value={purchaseDate}
                      onChangeText={setPurchaseDate}
                      style={styles.input}
                    />
                  </View>

                  {submitError && (
                    <View style={styles.errorBanner}>
                      <Ionicons name="alert-circle" size={16} color="#DC2626" style={{ marginRight: 8, marginTop: 1 }} />
                      <ThemedText style={styles.errorBannerText}>{submitError}</ThemedText>
                      <TouchableOpacity onPress={() => setSubmitError(null)} style={{ marginLeft: 8 }}>
                        <Ionicons name="close" size={16} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  )}

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
                        <Ionicons name="moon-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
                        <ThemedText style={styles.submitText}>{submitLabel}</ThemedText>
                      </View>
                    )}
                  </TouchableOpacity>
                </ThemedView>
              </>
            )}

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
