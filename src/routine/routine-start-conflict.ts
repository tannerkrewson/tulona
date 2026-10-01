import { Alert, Platform } from 'react-native';

import type { ActiveRoutine, RoutineDefinition } from '@domain';

export type RoutineConflictChoice = 'resume' | 'cancel-and-start';

/** Asks whether to resume the existing run or end it before another routine starts. */
export function chooseRoutineStartConflict(
  active: ActiveRoutine,
  target: RoutineDefinition
): Promise<RoutineConflictChoice | null> {
  const current = active.routineSnapshot.name;
  const message = `${current} is paused. Resume it, or end it and start ${target.name}.`;
  if (Platform.OS === 'web') {
    const confirm = (globalThis as { confirm?: (text: string) => boolean }).confirm;
    return Promise.resolve(
      confirm?.(`End ${current} and start ${target.name}?`) ? 'cancel-and-start' : null
    );
  }
  return new Promise((resolve) => {
    Alert.alert(
      `${current} Is in Progress`,
      message,
      [
        { text: `Resume ${current}`, onPress: () => resolve('resume') },
        {
          text: `Start ${target.name}`,
          style: 'destructive',
          onPress: () => resolve('cancel-and-start'),
        },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) }
    );
  });
}
