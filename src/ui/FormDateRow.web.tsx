import { useAppTheme } from '@theme';

import { FormRow } from './Form';
import type { FormDateRowProps } from './FormDateRow';

export function FormDateRow({ label, value, onChange, maximumDate, testID }: FormDateRowProps) {
  const { colorScheme, colors } = useAppTheme();
  return (
    <FormRow
      label={label}
      trailing={
        <input
          aria-label={label}
          data-testid={testID}
          max={maximumDate}
          onChange={(event) => {
            if (event.currentTarget.value) onChange(event.currentTarget.value);
          }}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: colors.textMuted,
            colorScheme,
            fontSize: 17,
            textAlign: 'right',
          }}
          type="date"
          value={value}
        />
      }
    />
  );
}
