import DateTimePickerComponent from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { useAppTheme } from '@theme';

import { FormRow } from './Form';

export interface FormDateRowProps {
  label: string;
  /** A local calendar day as YYYY-MM-DD. */
  value: string;
  onChange: (value: string) => void;
  testID?: string;
}

function dateFromDay(value: string): Date {
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function dayFromDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** A form row with the system's compact date control. */
export function FormDateRow({ label, value, onChange, testID }: FormDateRowProps) {
  const { colorScheme, colors } = useAppTheme();
  const [dialogOpen, setDialogOpen] = useState(false);
  const date = dateFromDay(value);

  if (Platform.OS === 'android') {
    return (
      <>
        <FormRow
          label={label}
          onPress={() => setDialogOpen(true)}
          testID={testID}
          value={date.toLocaleDateString()}
        />
        {dialogOpen ? (
          <DateTimePickerComponent
            display="default"
            mode="date"
            onDismiss={() => setDialogOpen(false)}
            onValueChange={(_event, next) => {
              setDialogOpen(false);
              onChange(dayFromDate(next));
            }}
            presentation="dialog"
            value={date}
          />
        ) : null}
      </>
    );
  }

  return (
    <FormRow
      label={label}
      trailing={
        <View style={{ alignItems: 'flex-end' }}>
          <DateTimePickerComponent
            accentColor={colors.primary}
            display="compact"
            mode="date"
            onValueChange={(_event, next) => onChange(dayFromDate(next))}
            testID={testID}
            themeVariant={colorScheme}
            value={date}
          />
        </View>
      }
    />
  );
}
