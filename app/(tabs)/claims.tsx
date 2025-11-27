import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts } from '@/constants/theme';
import { StyleSheet } from 'react-native';

export default function ClaimsScreen() {
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#E4E4E4', dark: '#1E293B' }}
      headerImage={
        <IconSymbol
          size={260}
          color="#64748B"
          name="doc.text.magnifyingglass"
          style={styles.headerImage}
        />
      }
    >
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title" style={{ fontFamily: Fonts.rounded }}>
          My Claims
        </ThemedText>
      </ThemedView>

      <ThemedText>View the status of all your submitted expenses.</ThemedText>

      <ThemedView style={styles.card}>
        <ThemedText>No claims submitted yet.</ThemedText>
      </ThemedView>
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
});
