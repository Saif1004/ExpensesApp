import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
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
import PaywallScreen from "../../components/paywall-screen";
import { ThemedText } from "../../components/themed-text";
import { usePostHog } from "posthog-react-native";
import { useAuth } from "../context/AuthProvider";
import { useTheme } from "../../hooks/useTheme";

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

  const { user, isPro } = useAuth();
  const { tokens: t, mode } = useTheme();
  const posthog = usePostHog();
  const isDark = mode === "dark";

  const flatListRef = useRef<FlatList>(null);
  const tabBarHeight = useBottomTabBarHeight();

  const [botTyping, setBotTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const lastMessageRef = useRef<string>("");

  const [messages, setMessages] = useState<ChatMessage[]>(([
    {
      id: "1",
      text: "Hi! I'm your expense assistant. Ask me about claims, receipts, or policy.",
      sender: "bot"
    }
  ]));

  const [input, setInput] = useState("");
  const [remainingAI, setRemainingAI] = useState<number | null>(null);
  const [creditLimit,  setCreditLimit]  = useState<number | null>(null);

  // fetch how many ai credits are left for this org

  useEffect(() => {
    const loadCredits = async () => {
      if (!user) return;

      try {
        const token = await user.getIdToken(true);

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
        if (data.limit !== undefined) {
          setCreditLimit(data.limit);
        }
      } catch {}
    };

    loadCredits();
  }, [user]);

  // sends the user's message and streams the bot reply

  const sendMessage = async (preset?: string) => {

    if (sending || !user) return;

    const text = preset || input.trim();
    if (!text) return;

    if (text === lastMessageRef.current) return;

    lastMessageRef.current = text;
    setSending(true);
    posthog?.capture("chatbot_message_sent", { is_preset: !!preset, message_length: text.length });

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

      const token = await user.getIdToken(true);

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
        const botErr: ChatMessage = {
          id: `${Date.now()}err`,
          text: data.error || "Something went wrong.",
          sender: "bot"
        };
        setMessages(prev => [...prev, botErr]);
        return;
      }

      if (data.remaining !== undefined) {
        setRemainingAI(data.remaining);
        if (data.remaining === 0) posthog?.capture("chatbot_credits_depleted");
      }
      if (data.limit !== undefined) {
        setCreditLimit(data.limit);
      }

      posthog?.capture("chatbot_response_received", { credits_remaining: data.remaining ?? null });

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

  // all the styles for this screen

  const styles = useMemo(() => StyleSheet.create({

    safe: { flex: 1, backgroundColor: t.bg },

    container: { flex: 1, paddingTop: 16, paddingHorizontal: 16, backgroundColor: t.bg },

    title: {
      fontSize: 28,
      fontWeight: "800",
      color: t.text,
      letterSpacing: -1,
      marginBottom: 16
    },

    credits: {
      textAlign: "center",
      marginBottom: 8,
      fontSize: 12,
      color: t.success
    },

    quickRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 14
    },

    quickBtn: {
      backgroundColor: t.surface,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
    },

    quickText: {
      color: t.textSecondary,
      fontSize: 12,
      fontWeight: "500"
    },

    messageBubble: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
      marginBottom: 8,
      maxWidth: "82%"
    },

    userBubble: {
      alignSelf: "flex-end",
      backgroundColor: t.accent,
      borderBottomRightRadius: 6,
    },

    botBubble: {
      alignSelf: "flex-start",
      backgroundColor: t.surface,
      borderBottomLeftRadius: 6,
    },

    userMessageText: {
      color: "#FFFFFF",
      fontSize: 14,
      lineHeight: 20
    },

    botMessageText: {
      color: t.text,
      fontSize: 14,
      lineHeight: 20
    },

    disclaimer: {
      textAlign: "center",
      fontSize: 11,
      color: t.textTertiary,
      paddingHorizontal: 4,
      paddingTop: 6,
      paddingBottom: 4,
    },

    inputWrapper: {
      flexDirection: "column",
      paddingHorizontal: 12,
      paddingTop: 6,
      paddingBottom: 10,
      backgroundColor: t.bg,
      borderTopWidth: 1,
      borderTopColor: t.surface,
    },

    inputRow: {
      flexDirection: "row",
      gap: 10,
      alignItems: "flex-end"
    },

    input: {
      flex: 1,
      backgroundColor: t.surface,
      color: t.text,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: 12,
      maxHeight: 120,
      fontSize: 14
    },

    sendButton: {
      backgroundColor: t.accent,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 999,
    },

    sendText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 14
    }

  }), [t, isDark]);

  // Guard: show paywall if not pro (after all hooks)
  if (!isPro) return <PaywallScreen />;

  // compact 3-dot typing indicator for the bot bubble
  const TypingDots = () => {
    const dot1 = useRef(new Animated.Value(0.3)).current;
    const dot2 = useRef(new Animated.Value(0.3)).current;
    const dot3 = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
      const pulse = (dot: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(dot, { toValue: 1,   duration: 300, useNativeDriver: true }),
            Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
            Animated.delay(500),
          ])
        );
      const a1 = pulse(dot1, 0);
      const a2 = pulse(dot2, 200);
      const a3 = pulse(dot3, 400);
      a1.start(); a2.start(); a3.start();
      return () => { a1.stop(); a2.stop(); a3.stop(); };
    }, []);

    return (
      <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 2 }}>
        {[dot1, dot2, dot3].map((opacity, i) => (
          <Animated.View
            key={i}
            style={{
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: t.textSecondary,
              opacity,
              marginHorizontal: 3,
            }}
          />
        ))}
      </View>
    );
  };

  // individual chat message with a fade-in animation

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
        <ThemedText style={item.sender === "user" ? styles.userMessageText : styles.botMessageText}>
          {item.text}
        </ThemedText>
      </Animated.View>
    );
  };

  // the main screen layout

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? tabBarHeight + 10 : 0}
      >

            <View style={styles.container}>

            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <View>
                <ThemedText type="title" style={styles.title}>
                  Virtual Assistant
                </ThemedText>

                {remainingAI !== null && creditLimit !== null && (
                  <ThemedText style={[
                    styles.credits,
                    remainingAI <= 5 && { color: t.warning },
                    remainingAI === 0 && { color: t.error }
                  ]}>
                    AI Credits: {remainingAI} / {creditLimit}
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
              </View>
            </TouchableWithoutFeedback>

            {/* message list — not inside TouchableWithoutFeedback so scrolling isn't blocked */}
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <MessageBubble item={item} />}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 12 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => {
                flatListRef.current?.scrollToEnd({ animated: true });
              }}
              ListFooterComponent={
                botTyping ? (
                  <View style={[styles.messageBubble, styles.botBubble]}>
                    <TypingDots />
                  </View>
                ) : null
              }
            />

            {/* input bar and disclaimer */}
            <View style={styles.inputWrapper}>

              <ThemedText style={styles.disclaimer}>
                AI responses are for guidance only and do not constitute professional tax, accounting, or legal advice. Rules vary by country — always verify with a qualified adviser.
              </ThemedText>

              <View style={styles.inputRow}>
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  placeholder="Ask something..."
                  placeholderTextColor={t.textTertiary}
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

          </View>

      </KeyboardAvoidingView>

    </SafeAreaView>
  );
}
