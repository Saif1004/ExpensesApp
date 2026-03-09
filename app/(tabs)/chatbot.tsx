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

export default function ChatbotScreen() {

  const { user } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      text: "Hi! I'm your expense assistant. Ask me about claims, receipts, or policy.",
      sender: "bot"
    }
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {

    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      text: trimmed,
      sender: "user"
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {

      const response = await fetch(CHATBOT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: trimmed,
          userId: user?.uid
        })
      });

      const data = await response.json();

      const botMessage: ChatMessage = {
        id: `${Date.now()}-bot`,
        text: data?.reply || "Sorry, I couldn't help with that.",
        sender: "bot"
      };

      setMessages(prev => [...prev, botMessage]);

    } catch {

      const botMessage: ChatMessage = {
        id: `${Date.now()}-bot`,
        text: "Sorry, the chatbot is unavailable right now.",
        sender: "bot"
      };

      setMessages(prev => [...prev, botMessage]);

    } finally {

      setLoading(false);

    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#0F172A" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ThemedView style={styles.container}>

        <ThemedText type="title" style={styles.title}>
          Help Assistant
        </ThemedText>

        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.chatList}
          renderItem={({ item }) => (
            <View
              style={[
                styles.messageBubble,
                item.sender === "user"
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
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#38BDF8" />
          </View>
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
            onPress={sendMessage}
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

  loadingRow:{
    paddingVertical:8
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