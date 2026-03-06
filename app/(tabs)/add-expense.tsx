import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
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

import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";
import { IconSymbol } from "../../components/ui/icon-symbol";
import { useAuth } from "../context/AuthProvider";

const AZURE_VALIDATE_URL = process.env.EXPO_PUBLIC_AZURE_VALIDATE_URL!;
const AZURE_OCR_URL = process.env.EXPO_PUBLIC_AZURE_OCR_URL!;
const AZURE_UPLOAD_URL = process.env.EXPO_PUBLIC_UPLOAD_URL!;

const CATEGORIES = ["Meals", "Travel", "Technology", "Office"] as const;

export default function AddExpenseScreen() {
  const { user } = useAuth();

  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]>("Meals");
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

      //////////////////////
      // Upload Receipt
      //////////////////////

      const uploadRes = await fetch(AZURE_UPLOAD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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

      if (data.category && CATEGORIES.includes(data.category)) {
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

      const response = await fetch(AZURE_VALIDATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      setCategory("Meals");
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
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <ThemedView style={styles.container}>

            <ThemedText type="title" style={styles.title}>
              Add Expense
            </ThemedText>

            <ThemedText style={styles.subtitle}>
              Claims validated by Azure policy engine
            </ThemedText>

            {/* RECEIPT CARD */}

            <ThemedView style={styles.card}>
              <View style={styles.switchRow}>
                <ThemedText style={{ color: "#fff" }}>
                  Receipt Attached
                </ThemedText>

                <Switch
                  value={hasReceipt}
                  onValueChange={handleReceiptToggle}
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

                    <ThemedText style={styles.previewHint}>
                      Tap to view • Long press to remove
                    </ThemedText>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.uploadBox}
                    onPress={pickReceipt}
                  >
                    {ocrLoading ? (
                      <ActivityIndicator color="#38BDF8" />
                    ) : (
                      <>
                        <IconSymbol
                          name="camera.fill"
                          size={40}
                          color="#38BDF8"
                        />
                        <ThemedText style={styles.uploadText}>
                          Scan Receipt
                        </ThemedText>
                      </>
                    )}
                  </TouchableOpacity>
                ))}
            </ThemedView>

            {/* FORM */}

            <ThemedView style={styles.card}>

              <TextInput
                placeholder="Amount (£)"
                placeholderTextColor="#64748B"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                style={styles.input}
              />

              <TextInput
                placeholder="Merchant"
                placeholderTextColor="#64748B"
                value={merchant}
                onChangeText={setMerchant}
                style={styles.input}
              />

              <TouchableOpacity
                style={styles.input}
                onPress={() => setShowDropdown(!showDropdown)}
              >
                <ThemedText style={{ color: "#F8FAFC" }}>
                  {category}
                </ThemedText>
              </TouchableOpacity>

              {showDropdown && (
                <View style={styles.dropdown}>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={styles.dropdownItem}
                      onPress={() => {
                        setCategory(cat);
                        setShowDropdown(false);
                      }}
                    >
                      <ThemedText style={{ color: "#F8FAFC" }}>
                        {cat}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TextInput
                placeholder="Purchase Date (YYYY-MM-DD)"
                placeholderTextColor="#64748B"
                value={purchaseDate}
                onChangeText={setPurchaseDate}
                style={styles.input}
              />

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSubmit}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.submitText}>
                    Submit Claim
                  </ThemedText>
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
  container:{
    padding:20,
    backgroundColor:"#0F172A",
    flex:1
  },
  title:{
    fontSize:32,
    color:"#F8FAFC",
    fontWeight:"bold",
    marginTop:24
  },
  subtitle:{
    color:"#94A3B8",
    marginBottom:20
  },
  card:{
    backgroundColor:"#1E293B",
    padding:18,
    borderRadius:14,
    marginBottom:18
  },
  uploadBox:{
    borderWidth:2,
    borderColor:"#334155",
    borderStyle:"dashed",
    borderRadius:16,
    padding:28,
    alignItems:"center",
    backgroundColor:"#0F172A"
  },
  uploadText:{
    color:"#38BDF8",
    marginTop:10
  },
  previewWrapper:{
    marginBottom:10
  },
  receiptPreview:{
    width:"100%",
    height:180,
    borderRadius:12
  },
  previewHint:{
    color:"#94A3B8",
    marginTop:8,
    textAlign:"center",
    fontSize:12
  },
  input:{
    backgroundColor:"#0F172A",
    color:"#F8FAFC",
    padding:12,
    borderRadius:10,
    marginBottom:12
  },
  dropdown:{
    backgroundColor:"#0F172A",
    borderRadius:10,
    marginBottom:12
  },
  dropdownItem:{
    padding:12,
    borderBottomWidth:1,
    borderBottomColor:"#334155"
  },
  switchRow:{
    flexDirection:"row",
    justifyContent:"space-between",
    alignItems:"center",
    marginBottom:12
  },
  submitButton:{
    backgroundColor:"#2563EB",
    padding:14,
    borderRadius:12,
    alignItems:"center"
  },
  submitText:{
    color:"#fff",
    fontWeight:"600"
  },
  modalOverlay:{
    flex:1,
    backgroundColor:"rgba(0,0,0,0.8)",
    justifyContent:"center",
    padding:20
  },
  modalContent:{
    backgroundColor:"#1E293B",
    borderRadius:16,
    padding:16
  },
  modalImage:{
    width:"100%",
    height:350,
    borderRadius:12
  },
  closeBtn:{
    marginTop:16,
    backgroundColor:"#2563EB",
    padding:12,
    borderRadius:12,
    alignItems:"center"
  }
});