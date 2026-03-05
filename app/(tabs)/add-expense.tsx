import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import * as ImagePicker from "expo-image-picker";

import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";
import { IconSymbol } from "../../components/ui/icon-symbol";

import { useAuth } from "../context/AuthProvider";

const AZURE_VALIDATE_URL =
  process.env.EXPO_PUBLIC_AZURE_VALIDATE_URL!;

const AZURE_OCR_URL =
  process.env.EXPO_PUBLIC_AZURE_OCR_URL!;

const AZURE_UPLOAD_URL =
  process.env.EXPO_PUBLIC_UPLOAD_URL!;

const CATEGORIES = ["Meals", "Travel", "Technology", "Office"];

export default function AddExpenseScreen() {

  const { user } = useAuth();

  const [amount,setAmount] = useState("");
  const [merchant,setMerchant] = useState("");
  const [category,setCategory] = useState("Meals");
  const [purchaseDate,setPurchaseDate] = useState("");

  const [receiptUrl,setReceiptUrl] = useState("");
  const [hasReceipt,setHasReceipt] = useState(false);

  const [saving,setSaving] = useState(false);
  const [ocrLoading,setOcrLoading] = useState(false);

  const [showDropdown,setShowDropdown] = useState(false);

  const validateDateFormat=(date:string)=>{
    return /^\d{4}-\d{2}-\d{2}$/.test(date);
  };

  /*
  ========================
  RECEIPT PICKER
  ========================
  */

  const pickReceipt = () => {

    Alert.alert(
      "Add Receipt",
      "Choose image source",
      [
        { text:"Camera", onPress: openCamera },
        { text:"Photo Library", onPress: openLibrary },
        { text:"Cancel", style:"cancel" }
      ]
    );

  };

  const openCamera = async () => {

    const result =
      await ImagePicker.launchCameraAsync({
        base64:true,
        quality:0.7
      });

    if(!result.canceled){
      processReceipt(result.assets[0]);
    }

  };

  const openLibrary = async () => {

    const result =
      await ImagePicker.launchImageLibraryAsync({
        base64:true,
        quality:0.7
      });

    if(!result.canceled){
      processReceipt(result.assets[0]);
    }

  };

  /*
  ========================
  OCR + BLOB UPLOAD
  ========================
  */

  const processReceipt = async(image:any)=>{

    try{

      setOcrLoading(true);

      // upload to blob
      const uploadRes =
        await fetch(AZURE_UPLOAD_URL,{
          method:"POST",
          headers:{
            "Content-Type":"application/json"
          },
          body:JSON.stringify({
            image:image.base64
          })
        });

      const uploadData = await uploadRes.json();

      setReceiptUrl(uploadData.url);

      // OCR
      const ocrRes =
        await fetch(AZURE_OCR_URL,{
          method:"POST",
          headers:{
            "Content-Type":"application/json"
          },
          body:JSON.stringify({
            image:image.base64
          })
        });

      const data = await ocrRes.json();

      if(data.amount) setAmount(String(data.amount));
      if(data.merchant) setMerchant(data.merchant);
      if(data.date) setPurchaseDate(data.date);

      setHasReceipt(true);

      Alert.alert("Receipt scanned");

    }
    catch{
      Alert.alert("OCR failed");
    }
    finally{
      setOcrLoading(false);
    }

  };

  /*
  ========================
  SUBMIT CLAIM
  ========================
  */

  const handleSubmit = async ()=>{

    if(!user){
      Alert.alert("Not logged in");
      return;
    }

    if(!amount || isNaN(Number(amount))){
      Alert.alert("Invalid amount");
      return;
    }

    if(!merchant.trim()){
      Alert.alert("Enter merchant");
      return;
    }

    if(!validateDateFormat(purchaseDate)){
      Alert.alert("Use YYYY-MM-DD date");
      return;
    }

    try{

      setSaving(true);

      const response =
        await fetch(AZURE_VALIDATE_URL,{
          method:"POST",
          headers:{
            "Content-Type":"application/json"
          },
          body:JSON.stringify({
            amount:Number(amount),
            merchant:merchant.trim(),
            category,
            purchaseDate,
            hasReceipt,
            receiptUrl,
            userId:user.uid,
            userEmail:user.email
          })
        });

      const result = await response.json();

      if(!result.valid){
        Alert.alert("Policy violation",result.reason);
        return;
      }

      Alert.alert("Claim submitted");

      setAmount("");
      setMerchant("");
      setPurchaseDate("");
      setReceiptUrl("");
      setHasReceipt(false);

    }
    finally{
      setSaving(false);
    }

  };

  return(

    <ThemedView style={styles.container}>

      <ThemedText type="title" style={styles.title}>
        Add Expense
      </ThemedText>

      <TouchableOpacity
        style={styles.uploadBox}
        onPress={pickReceipt}
      >

        {ocrLoading
          ? <ActivityIndicator color="#38BDF8"/>
          : <>
              <IconSymbol
                name="camera.fill"
                size={40}
                color="#38BDF8"
              />
              <ThemedText style={styles.uploadText}>
                Scan Receipt
              </ThemedText>
            </>
        }

      </TouchableOpacity>

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
          onPress={()=>setShowDropdown(!showDropdown)}
        >
          <ThemedText style={{color:"#F8FAFC"}}>
            {category}
          </ThemedText>
        </TouchableOpacity>

        {showDropdown &&(

          <View style={styles.dropdown}>
            {CATEGORIES.map(cat=>(
              <TouchableOpacity
                key={cat}
                style={styles.dropdownItem}
                onPress={()=>{
                  setCategory(cat);
                  setShowDropdown(false);
                }}
              >
                <ThemedText style={{color:"#F8FAFC"}}>
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

        <View style={styles.switchRow}>
          <ThemedText style={{color:"#fff"}}>
            Receipt Attached
          </ThemedText>

          <Switch
            value={hasReceipt}
            onValueChange={setHasReceipt}
          />
        </View>

        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff"/>
            : <ThemedText style={styles.submitText}>
                Submit Claim
              </ThemedText>
          }
        </TouchableOpacity>

      </ThemedView>

    </ThemedView>

  );

}

const styles=StyleSheet.create({

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

uploadBox:{
borderWidth:2,
borderColor:"#1E293B",
borderStyle:"dashed",
borderRadius:16,
padding:28,
alignItems:"center",
marginBottom:20
},

uploadText:{
color:"#38BDF8",
marginTop:10
},

card:{
backgroundColor:"#1E293B",
padding:18,
borderRadius:14
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
}

});