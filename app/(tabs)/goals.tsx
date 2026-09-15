import { Text } from '@expo/ui';

import { Screen } from '../../src/ui';

/** Temporary route target for the Goals tab until the goal-domain screen lands. */
export default function GoalsRoute() {
  return (
    <Screen testID="goals-screen" title="Goals">
      <Text>Goals are coming soon.</Text>
    </Screen>
  );
}
