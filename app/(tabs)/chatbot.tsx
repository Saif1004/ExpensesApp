import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from "react-native";

import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "../../components/themed-text";
import { useAuth } from "../context/AuthProvider";

const CHATBOT_URL = process.env.EXPO_PUBLIC_CHATBOT_URL!;

type ChatMessage = {
  id: string;
  text: string;
  sender: "user" | "bot";
};

const QUICK_QUESTIONS = [
  "What is the meal limit?",
  "Why was my claim rejected?",
  "How do I scan a receipt?",
  "How much have I spent recently?"
];

export default function ChatbotScreen() {

  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);

  const [keyboardHeight,setKeyboardHeight] = useState(0);

  const [messages,setMessages] = useState<ChatMessage[]>([
    {
      id:"1",
      text:"Hi! I'm your expense assistant. Ask me about claims, receipts, or policy.",
      sender:"bot"
    }
  ]);

  const [input,setInput] = useState("");
  const [loading,setLoading] = useState(false);

  /////////////////////////////////////////////////////////
  // KEYBOARD LISTENERS
  /////////////////////////////////////////////////////////

  useEffect(()=>{

    const show = Keyboard.addListener(
      "keyboardDidShow",
      (e)=> setKeyboardHeight(e.endCoordinates.height)
    );

    const hide = Keyboard.addListener(
      "keyboardDidHide",
      ()=> setKeyboardHeight(0)
    );

    return ()=>{
      show.remove();
      hide.remove();
    };

  },[]);

  /////////////////////////////////////////////////////////
  // SEND MESSAGE
  /////////////////////////////////////////////////////////

  const sendMessage = async (preset?:string)=>{

    const text = preset || input.trim();
    if(!text || loading) return;

    const userMessage:ChatMessage = {
      id:Date.now().toString(),
      text,
      sender:"user"
    };

    setMessages(prev=>[...prev,userMessage]);
    setInput("");

    setTimeout(()=>{
      flatListRef.current?.scrollToEnd({animated:true});
    },100);

    setLoading(true);

    try{

      const response = await fetch(CHATBOT_URL,{
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          message:text,
          userId:user?.uid
        })
      });

      const data = await response.json();

      const botMessage:ChatMessage = {
        id:`${Date.now()}bot`,
        text:data?.reply || "Sorry, I couldn't help.",
        sender:"bot"
      };

      setMessages(prev=>[...prev,botMessage]);

      setTimeout(()=>{
        flatListRef.current?.scrollToEnd({animated:true});
      },100);

    }catch{

      setMessages(prev=>[
        ...prev,
        {
          id:`${Date.now()}bot`,
          text:"Chatbot unavailable right now.",
          sender:"bot"
        }
      ]);

    }finally{
      setLoading(false);
    }

  };

  /////////////////////////////////////////////////////////
  // UI
  /////////////////////////////////////////////////////////

  return(

    <SafeAreaView style={styles.safe}>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>

        <KeyboardAvoidingView
          style={{flex:1}}
          behavior={Platform.OS==="ios" ? "padding" : undefined}
        >

          <View style={styles.container}>

            {/* TOP */}

            <View style={{flex:1}}>

              <ThemedText type="title" style={styles.title}>
                Virtual Assistant
              </ThemedText>

              <View style={styles.quickRow}>
                {QUICK_QUESTIONS.map(q=>(
                  <TouchableOpacity
                    key={q}
                    style={styles.quickBtn}
                    onPress={()=>sendMessage(q)}
                  >
                    <ThemedText style={styles.quickText}>
                      {q}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>

              {/* CHAT */}

              <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={(item)=>item.id}
                style={{flex:1}}
                contentContainerStyle={{paddingBottom:120}}
                renderItem={({item})=>(
                  <View
                    style={[
                      styles.messageBubble,
                      item.sender==="user"
                        ? styles.userBubble
                        : styles.botBubble
                    ]}
                  >
                    <ThemedText style={styles.messageText}>
                      {item.text}
                    </ThemedText>
                  </View>
                )}
              />

              {loading && (
                <ActivityIndicator
                  color="#38BDF8"
                  style={{marginBottom:10}}
                />
              )}

            </View>

            {/* INPUT */}

            <View
              style={[
                styles.inputContainer,
                {
                  bottom:
                    keyboardHeight > 0
                      ? keyboardHeight - insets.bottom
                      : -insets.bottom - 10
                }
              ]}
            >

              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Ask something..."
                placeholderTextColor="#64748B"
                style={styles.input}
              />

              <TouchableOpacity
                style={styles.sendButton}
                onPress={()=>sendMessage()}
              >
                <ThemedText style={styles.sendText}>
                  Send
                </ThemedText>
              </TouchableOpacity>

            </View>

          </View>

        </KeyboardAvoidingView>

      </TouchableWithoutFeedback>

    </SafeAreaView>

  );

}

const styles = StyleSheet.create({

safe:{
flex:1,
backgroundColor:"#0F172A"
},

container:{
flex:1,
padding:16,
backgroundColor:"#0F172A"
},

title:{
fontSize:28,
fontWeight:"bold",
color:"#F8FAFC",
marginBottom:16
},

quickRow:{
flexDirection:"row",
flexWrap:"wrap",
gap:8,
marginBottom:12
},

quickBtn:{
backgroundColor:"#1E293B",
paddingHorizontal:12,
paddingVertical:8,
borderRadius:12
},

quickText:{
color:"#38BDF8",
fontSize:12
},

messageBubble:{
padding:12,
borderRadius:14,
marginBottom:10,
maxWidth:"80%"
},

userBubble:{
alignSelf:"flex-end",
backgroundColor:"#2563EB"
},

botBubble:{
alignSelf:"flex-start",
backgroundColor:"#1E293B"
},

messageText:{
color:"#FFFFFF"
},

inputContainer:{
position:"absolute",
left:16,
right:16,
flexDirection:"row",
alignItems:"center",
gap:10,
paddingBottom:12
},

input:{
flex:1,
backgroundColor:"#1E293B",
color:"#F8FAFC",
borderRadius:12,
paddingHorizontal:12,
paddingVertical:12
},

sendButton:{
backgroundColor:"#2563EB",
paddingHorizontal:16,
paddingVertical:12,
borderRadius:12
},

sendText:{
color:"#FFFFFF",
fontWeight:"600"
}

});