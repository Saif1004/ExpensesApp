import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts } from '@/constants/theme';
import { StyleSheet, TouchableOpacity } from 'react-native';

export default function ProfileScreen() {
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#E4E4E4', dark: '#1E293B' }}
      headerImage={
        <IconSymbol
          size={260}
          color="#64748B"
          name="person.circle.fill"
          style={styles.headerImage}
        />
      }
    >
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title" style={{ fontFamily: Fonts.rounded }}>
          Profile
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText>Email: your@email.com</ThemedText>
      </ThemedView>

      <TouchableOpacity style={styles.logoutBtn}>
        <ThemedText type="defaultSemiBold">Sign Out</ThemedText>
      </TouchableOpacity>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  headerImage: {
    position: 'absolute',
    bottom: -70,
    left: -30,
  },
  titleContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  card: {
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(120,120,120,0.1)',
  },
  logoutBtn: {
    marginTop: 30,
    padding: 16,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    alignItems: 'center',
  },
});
