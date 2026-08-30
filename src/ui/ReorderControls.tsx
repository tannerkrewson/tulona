import { Button, Row, Text } from '@expo/ui';

import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';

export interface ReorderControlsProps {
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  disabled?: boolean;
  testID?: string;
}

/** Paired, labeled large-target controls for moving an item in an ordered list. */
export function ReorderControls({
  onMoveUp,
  onMoveDown,
  canMoveUp = true,
  canMoveDown = true,
  disabled = false,
  testID,
}: ReorderControlsProps) {
  const { colors } = useAppTheme();
  const upEnabled = canMoveUp && onMoveUp != null;
  const downEnabled = canMoveDown && onMoveDown != null;

  return (
    <Row alignment="center" spacing={10} testID={testID}>
      <Button
        disabled={disabled || !upEnabled}
        onPress={onMoveUp}
        style={{
          borderColor: colors.border,
          borderRadius: 12,
          borderWidth: 1,
          height: 48,
          paddingHorizontal: 14,
        }}
        testID={testID ? `${testID}-up` : undefined}
        variant="outlined"
      >
        <Row alignment="center" spacing={6}>
          <AppIcon accessibilityLabel="Move up" color={colors.text} name="chevron-up" size={18} />
          <Text textStyle={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>Move up</Text>
        </Row>
      </Button>
      <Button
        disabled={disabled || !downEnabled}
        onPress={onMoveDown}
        style={{
          borderColor: colors.border,
          borderRadius: 12,
          borderWidth: 1,
          height: 48,
          paddingHorizontal: 14,
        }}
        testID={testID ? `${testID}-down` : undefined}
        variant="outlined"
      >
        <Row alignment="center" spacing={6}>
          <AppIcon
            accessibilityLabel="Move down"
            color={colors.text}
            name="chevron-down"
            size={18}
          />
          <Text textStyle={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>Move down</Text>
        </Row>
      </Button>
    </Row>
  );
}
