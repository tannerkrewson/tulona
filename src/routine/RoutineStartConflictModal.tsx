import { Column, Text } from '@expo/ui';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ActiveRoutine, RoutineDefinition } from '@domain';
import { useAppTheme } from '@theme';
import { AppButton } from '@ui';

export interface RoutineStartConflictModalProps {
  activeRoutine: ActiveRoutine | null;
  targetRoutine: RoutineDefinition | null;
  visible: boolean;
  busy: boolean;
  error?: string | null;
  onResume: () => void;
  onCancelAndStart: () => void;
  onKeepPaused: () => void;
}

/** Makes the existing run an explicit choice before another routine can start. */
export function RoutineStartConflictModal({
  activeRoutine,
  targetRoutine,
  visible,
  busy,
  error = null,
  onResume,
  onCancelAndStart,
  onKeepPaused,
}: RoutineStartConflictModalProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  if (!activeRoutine || !targetRoutine) return null;

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onKeepPaused();
      }}
      transparent
      visible={visible}
    >
      <View style={[styles.root, { paddingBottom: 20 + insets.bottom, paddingTop: 20 + insets.top }]}>
        <Pressable
          accessibilityLabel="Keep routine paused"
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onKeepPaused}
          style={styles.scrim}
        />
        <View
          accessibilityViewIsModal
          importantForAccessibility="yes"
          style={[styles.dialog, { backgroundColor: colors.surface, borderColor: colors.border }]}
          testID="routine-start-conflict"
        >
          <Column spacing={12} style={{ width: '100%' }}>
            <Text textStyle={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>
              Resolve the current routine
            </Text>
            <Text textStyle={{ color: colors.textMuted, fontSize: 15, lineHeight: 21 }}>
              {`${activeRoutine.routineSnapshot.name} is ${activeRoutine.status === 'running' ? 'running' : 'paused'}. Resume it, or cancel this run before starting ${targetRoutine.name}.`}
            </Text>
            {error ? (
              <Text
                textStyle={{ color: colors.danger.foreground, fontSize: 14, lineHeight: 19 }}
              >
                {error}
              </Text>
            ) : null}
            <Column spacing={8} style={{ width: '100%' }}>
              <AppButton
                disabled={busy}
                label="Resume current routine"
                onPress={onResume}
                style={{ height: 48, width: '100%' }}
                testID="resume-existing-routine"
              />
              <AppButton
                disabled={busy}
                label="Cancel run and start selected"
                onPress={onCancelAndStart}
                style={{ height: 48, width: '100%' }}
                testID="cancel-and-start-routine"
                variant="outlined"
              />
              <AppButton
                disabled={busy}
                label="Keep paused"
                onPress={onKeepPaused}
                style={{ height: 46, width: '100%' }}
                testID="keep-routine-paused"
                variant="outlined"
              />
            </Column>
          </Column>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  scrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.46)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  dialog: {
    alignSelf: 'center',
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: 560,
    padding: 20,
    width: '100%',
  },
});
