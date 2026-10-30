import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

type Props = {
  name?: string;
  instruction?: string;
  phase: string;
};

export default function AnimationPlaceholder({ name, instruction, phase }: Props) {
  return (
    <View style={styles.box} accessibilityLabel={instruction || name}>
      <Text style={styles.mark}>│○│</Text>
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.instruction}>{instruction}</Text>
      {phase === 'gap' ? <Text style={styles.phase}>…</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.tint,
    borderRadius: 24,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  mark: {
    fontSize: 42,
    color: colors.brand,
    marginBottom: 12,
  },
  name: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.label,
    textAlign: 'center',
  },
  instruction: {
    marginTop: 8,
    fontSize: 16,
    color: colors.l2,
    textAlign: 'center',
  },
  phase: {
    marginTop: 12,
    color: colors.l3,
  },
});
