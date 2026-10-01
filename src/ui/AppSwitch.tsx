import { Pressable, Switch, Text } from 'react-native';

import { useAppTheme } from '@theme';

export interface AppSwitchProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

/** A labelled system switch; tapping the label toggles it too. */
export function AppSwitch({
  label,
  value,
  onValueChange,
  disabled = false,
  testID,
}: AppSwitchProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: 12,
        minHeight: 44,
        opacity: disabled ? 0.5 : 1,
        width: '100%',
      }}
    >
      <Text style={{ color: colors.text, flex: 1, fontSize: 16 }}>{label}</Text>
      <Switch
        accessibilityElementsHidden
        disabled={disabled}
        importantForAccessibility="no"
        onValueChange={onValueChange}
        testID={testID}
        value={value}
      />
    </Pressable>
  );
}
