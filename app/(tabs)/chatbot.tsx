import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
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

  const [botTyping, setBotTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const lastMessageRef = useRef<string>("");

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      text: "Hi! I'm your expense assistant. Ask me about claims, receipts, or policy.",
      sender: "bot"
    }
  ]);

  const [input, setInput] = useState("");
  const [remainingAI, setRemainingAI] = useState<number | null>(null);

  /////////////////////////////////////////////////////////
  // LOAD CREDITS
  /////////////////////////////////////////////////////////

  useEffect(() => {
    const loadCredits = async () => {
      if (!user) return;

      try {
        const token = await user.getIdToken();

        const res = await fetch(CHATBOT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ message: "__getCredits__" })
        });

        const data = await res.json();

        if (data.remaining !== undefined) {
          setRemainingAI(data.remaining);
        }
      } catch {}
    };

    loadCredits();
  }, [user]);

  /////////////////////////////////////////////////////////
  // SEND MESSAGE
  /////////////////////////////////////////////////////////

  const sendMessage = async (preset?: string) => {

    if (sending || !user) return;

    const text = preset || input.trim();
    if (!text) return;

    if (text === lastMessageRef.current) return;

    lastMessageRef.current = text;
    setSending(true);

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      text,
      sender: "user"
    };

    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput("");
    setBotTyping(true);

    try {

      const token = await user.getIdToken();

      const response = await fetch(CHATBOT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          message: text,
          history: updatedMessages.slice(-10)
        })
      });

      const data = await response.json();

      if (!data.success) {
        Alert.alert("Error", data.error || "Something went wrong");
        return;
      }

      if (data.remaining !== undefined) {
        setRemainingAI(data.remaining);
      }

      const botMessage: ChatMessage = {
        id: `${Date.now()}bot`,
        text: data.reply,
        sender: "bot"
      };

      setMessages(prev => [...prev, botMessage]);

    } catch {

      setMessages(prev => [
        ...prev,
        {
          id: `${Date.now()}bot`,
          text: "Chatbot unavailable right now.",
          sender: "bot"
        }
      ]);

    } finally {
      setBotTyping(false);
      setSending(false);
    }
  };

  /////////////////////////////////////////////////////////
  // MESSAGE BUBBLE
  /////////////////////////////////////////////////////////

  const MessageBubble = ({ item }: { item: ChatMessage }) => {

    const fade = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      Animated.timing(fade, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true
      }).start();
    }, []);

    return (
      <Animated.View
        style={[
          styles.messageBubble,
          item.sender === "user"
            ? styles.userBubble
            : styles.botBubble,
          { opacity: fade }
        ]}
      >
        <ThemedText style={styles.messageText}>
          {item.text}
        </ThemedText>
      </Animated.View>
    );
  };

  /////////////////////////////////////////////////////////
  // UI
  /////////////////////////////////////////////////////////

  return (
  <SafeAreaView style={styles.safe}>

    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >

      <View style={styles.container}>

        <ThemedText type="title" style={styles.title}>
          Virtual Assistant
        </ThemedText>

        {remainingAI !== null && (
          <ThemedText style={{
            textAlign: "center",
            marginBottom: 8,
            fontSize: 12,
            color:
              remainingAI > 30 ? "#22C55E"
              : remainingAI > 10 ? "#F59E0B"
              : "#EF4444"
          }}>
            AI Credits: {remainingAI} / 100
          </ThemedText>
        )}

        <View style={styles.quickRow}>
          {QUICK_QUESTIONS.map(q => (
            <TouchableOpacity
              key={q}
              style={styles.quickBtn}
              onPress={() => sendMessage(q)}
              disabled={sending}
            >
              <ThemedText style={styles.quickText}>
                {q}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {/* CHAT AREA */}
        <View style={{ flex: 1 }}>

          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <MessageBubble item={item} />}
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingBottom: 20
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}

            onContentSizeChange={() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }}

            ListFooterComponent={
              botTyping ? (
                <View style={[styles.messageBubble, styles.botBubble]}>
                  <ThemedText style={styles.messageText}>
                    ...
                  </ThemedText>
                </View>
              ) : null
            }
          />

        </View>

        {/* INPUT (NOW NORMAL, NOT ABSOLUTE) */}
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
            style={[
              styles.sendButton,
              sending && { opacity: 0.5 }
            ]}
            onPress={() => sendMessage()}
            disabled={sending}
          >
            <ThemedText style={styles.sendText}>
              Send
            </ThemedText>
          </TouchableOpacity>

        </View>

      </View>

    </KeyboardAvoidingView>

  </SafeAreaView>
);
}

/////////////////////////////////////////////////////////
// STYLES (UNCHANGED + FIX)
/////////////////////////////////////////////////////////

const styles = StyleSheet.create({

  safe: { flex: 1, backgroundColor: "#0F172A" },

  container: { flex: 1, padding: 16, backgroundColor: "#0F172A" },

  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#F8FAFC",
    marginBottom: 16
  },

  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12
  },

  quickBtn: {
    backgroundColor: "#1E293B",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12
  },

  quickText: {
    color: "#38BDF8",
    fontSize: 12
  },

  messageBubble: {
    padding: 12,
    borderRadius: 14,
    marginBottom: 10,
    maxWidth: "80%"
  },

  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#2563EB"
  },

  botBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#1E293B"
  },

  messageText: {
    color: "#FFFFFF"
  },

  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginTop: 10,
    paddingBottom: 10
  },

  input: {
    flex: 1,
    backgroundColor: "#1E293B",
    color: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    maxHeight: 120
  },

  sendButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12
  },

  sendText: {
    color: "#FFFFFF",
    fontWeight: "600"
  }

});