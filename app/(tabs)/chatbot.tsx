import { useEffect, useRef, useState } from "react";
import {
  Animated,
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

import { SafeAreaView } from "react-native-safe-area-context";
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
  const flatListRef = useRef<FlatList>(null);

  const [botTyping,setBotTyping] = useState(false);

  const [messages,setMessages] = useState<ChatMessage[]>([
    {
      id:"1",
      text:"Hi! I'm your expense assistant. Ask me about claims, receipts, or policy.",
      sender:"bot"
    }
  ]);

  const [input,setInput] = useState("");

  /////////////////////////////////////////////////////////
  // AUTO SCROLL
  /////////////////////////////////////////////////////////

  useEffect(()=>{
    const timer=setTimeout(()=>{
      flatListRef.current?.scrollToEnd({animated:true});
    },120);

    return ()=>clearTimeout(timer);

  },[messages,botTyping]);

  /////////////////////////////////////////////////////////
  // SEND MESSAGE
  /////////////////////////////////////////////////////////

  const sendMessage = async (preset?:string)=>{

    const text = preset || input.trim();
    if(!text) return;

    const userMessage:ChatMessage={
      id:Date.now().toString(),
      text,
      sender:"user"
    };

    setMessages(prev=>[...prev,userMessage]);
    setInput("");
    setBotTyping(true);

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

      const data=await response.json();

      const botMessage:ChatMessage={
        id:`${Date.now()}bot`,
        text:data?.reply || "Sorry, I couldn't help.",
        sender:"bot"
      };

      setBotTyping(false);
      setMessages(prev=>[...prev,botMessage]);

    }catch{

      setBotTyping(false);

      setMessages(prev=>[
        ...prev,
        {
          id:`${Date.now()}bot`,
          text:"Chatbot unavailable right now.",
          sender:"bot"
        }
      ]);

    }

  };

  /////////////////////////////////////////////////////////
  // MESSAGE BUBBLE
  /////////////////////////////////////////////////////////

  const MessageBubble = ({item}:{item:ChatMessage})=>{

    const fade = useRef(new Animated.Value(0)).current;

    useEffect(()=>{
      Animated.timing(fade,{
        toValue:1,
        duration:250,
        useNativeDriver:true
      }).start();
    },[]);

    return(
      <Animated.View
        style={[
          styles.messageBubble,
          item.sender==="user"
            ? styles.userBubble
            : styles.botBubble,
          {opacity:fade}
        ]}
      >
        <ThemedText style={styles.messageText}>
          {item.text}
        </ThemedText>
      </Animated.View>
    );
  };

  /////////////////////////////////////////////////////////
  // RENDER CHAT ITEM
  /////////////////////////////////////////////////////////

  const renderItem = ({item}:{item:ChatMessage})=>{
    return <MessageBubble item={item}/>;
  };

  /////////////////////////////////////////////////////////
  // UI
  /////////////////////////////////////////////////////////

  return(

    <SafeAreaView style={styles.safe}>

      <TouchableWithoutFeedback
        onPress={Keyboard.dismiss}
        accessible={false}
      >

        <KeyboardAvoidingView
          style={{flex:1}}
          behavior={Platform.OS==="ios"?"padding":"height"}
          keyboardVerticalOffset={90}
        >

          <View style={styles.container}>

            <ThemedText type="title" style={styles.title}>
              Virtual Assistant
            </ThemedText>

            {/* QUICK QUESTIONS */}

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
              renderItem={renderItem}
              style={{flex:1}}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              maintainVisibleContentPosition={{
                minIndexForVisible:0
              }}
              contentContainerStyle={{
                paddingBottom:140
              }}
              ListFooterComponent={
                botTyping ? (
                  <View style={[styles.messageBubble,styles.botBubble]}>
                    <ThemedText style={styles.messageText}>
                      ...
                    </ThemedText>
                  </View>
                ) : null
              }
            />

            {/* INPUT BAR */}

            <View style={styles.inputContainer}>

              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Ask something..."
                placeholderTextColor="#64748B"
                style={styles.input}
                multiline
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

const styles=StyleSheet.create({

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
flexDirection:"row",
alignItems:"flex-end",
gap:10,
marginTop:10,
marginBottom:-45
},

input:{
flex:1,
backgroundColor:"#1E293B",
color:"#F8FAFC",
borderRadius:12,
paddingHorizontal:12,
paddingVertical:12,
maxHeight:120
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