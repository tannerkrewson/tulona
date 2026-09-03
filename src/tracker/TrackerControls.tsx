import { Row } from '@expo/ui';

import type { TimeTransition } from '@domain';
import { AppButton } from '@ui';

export interface TrackerControlsProps {
  activeTransition: TimeTransition | null;
  onAdjustStart: () => void;
  onHistory: () => void;
}

/** Keeps tracker maintenance actions available without reintroducing the old header card. */
export function TrackerControls({
  activeTransition,
  onAdjustStart,
  onHistory,
}: TrackerControlsProps) {
  return (
    <Row alignment="center" spacing={8} style={{ width: '100%' }}>
      <AppButton
        label="History"
        onPress={onHistory}
        style={{ height: 46, width: activeTransition ? '46%' : '100%' }}
        testID="tracker-history"
        variant="outlined"
      />
      {activeTransition ? (
        <AppButton
          label="Adjust start"
          onPress={onAdjustStart}
          style={{ height: 46, width: '46%' }}
          testID="tracker-adjust-start"
          variant="outlined"
        />
      ) : null}
    </Row>
  );
}
