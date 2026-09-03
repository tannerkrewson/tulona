import { Column, Picker, Row, Text } from '@expo/ui';

import { useAppTheme } from '@theme';

import { AccessiblePicker } from './AccessiblePicker';

export interface DurationValue {
  hours: number;
  minutes: number;
  seconds: number;
}

export interface DurationPickerProps extends DurationValue {
  disabled?: boolean;
  onChange: (value: DurationValue) => void;
  testID?: string;
}

function options(maximum: number): number[] {
  return Array.from({ length: maximum + 1 }, (_, value) => value);
}

function padded(value: number): string {
  return String(value).padStart(2, '0');
}

function Wheel({
  label,
  maximum,
  onChange,
  testID,
  value,
  disabled,
}: {
  label: string;
  maximum: number;
  onChange: (value: number) => void;
  testID: string;
  value: number;
  disabled: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Column spacing={6} style={{ width: '31%' }}>
      <Text textStyle={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <AccessiblePicker
        appearance="wheel"
        enabled={!disabled}
        label={label}
        onValueChange={(next) => onChange(Number(next))}
        selectedValue={value}
        testID={testID}
      >
        {options(maximum).map((option) => (
          <Picker.Item key={option} label={padded(option)} value={option} />
        ))}
      </AccessiblePicker>
    </Column>
  );
}

/** Compact duration wheels with bounded minute and second columns. */
export function DurationPicker({
  hours,
  minutes,
  seconds,
  disabled = false,
  onChange,
  testID = 'duration-picker',
}: DurationPickerProps) {
  const hourMaximum = Math.max(99, hours);
  return (
    <Row alignment="start" spacing={8} style={{ width: '100%' }} testID={testID}>
      <Wheel
        disabled={disabled}
        label="Hours"
        maximum={hourMaximum}
        onChange={(next) => onChange({ hours: next, minutes, seconds })}
        testID={`${testID}-hours`}
        value={hours}
      />
      <Wheel
        disabled={disabled}
        label="Minutes"
        maximum={59}
        onChange={(next) => onChange({ hours, minutes: next, seconds })}
        testID={`${testID}-minutes`}
        value={minutes}
      />
      <Wheel
        disabled={disabled}
        label="Seconds"
        maximum={59}
        onChange={(next) => onChange({ hours, minutes, seconds: next })}
        testID={`${testID}-seconds`}
        value={seconds}
      />
    </Row>
  );
}
