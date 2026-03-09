import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";
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

  const [messages,setMessages] = useState<ChatMessage[]>([
    {
      id:"1",
      text:"Hi! I'm your expense assistant. Ask me about claims, receipts, or policy.",
      sender:"bot"
    }
  ]);

  const [input,setInput] = useState("");
  const [loading,setLoading] = useState(false);

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

  return(

    <KeyboardAvoidingView
      style={{flex:1,backgroundColor:"#0F172A"}}
      behavior={Platform.OS==="ios"?"padding":undefined}
    >

      <ThemedView style={styles.container}>

        <ThemedText type="title" style={styles.title}>
          Virtual Assistant
        </ThemedText>

        {/* Quick suggestions */}

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

        <FlatList
          data={messages}
          keyExtractor={(item)=>item.id}
          contentContainerStyle={styles.chatList}
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
          <ActivityIndicator color="#38BDF8"/>
        )}

        <View style={styles.inputRow}>

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

      </ThemedView>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({

container:{
flex:1,
padding:16,
backgroundColor:"#0F172A"
},

title:{
marginTop:24,
marginBottom:16,
fontSize:28,
fontWeight:"bold",
color:"#F8FAFC"
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

chatList:{
paddingBottom:12
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

inputRow:{
flexDirection:"row",
alignItems:"center",
gap:10,
marginTop:8
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