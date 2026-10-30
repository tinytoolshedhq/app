import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../theme/colors';

type Props = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  testID?: string;
};

export default function Chip({ label, selected, onPress, testID }: Props) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[styles.chip, selected && styles.selected]}
    >
      <Text style={[styles.text, selected && styles.selectedText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: colors.fill,
    marginRight: 8,
    marginBottom: 8,
  },
  selected: {
    backgroundColor: colors.brand,
  },
  text: {
    color: colors.label,
    fontSize: 15,
  },
  selectedText: {
    color: colors.onbrand,
    fontWeight: '600',
  },
});
