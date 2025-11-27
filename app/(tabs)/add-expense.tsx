import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts } from '@/constants/theme';
import { StyleSheet, TouchableOpacity } from 'react-native';

export default function AddExpense() {
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#E4E4E4', dark: '#1E293B' }}
      headerImage={
        <IconSymbol
          size={260}
          color="#64748B"
          name="camera.fill"
          style={styles.headerImage}
        />
      }
    >
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title" style={{ fontFamily: Fonts.rounded }}>
          Add Expense
        </ThemedText>
      </ThemedView>

      <ThemedText>Upload a receipt and we’ll extract the details for you.</ThemedText>

      <TouchableOpacity style={styles.uploadBtn}>
        <ThemedText type="defaultSemiBold">Upload Receipt</ThemedText>
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
  uploadBtn: {
    marginTop: 25,
    padding: 16,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    alignItems: 'center',
  },
});
