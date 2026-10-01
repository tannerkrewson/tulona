import DateTimePickerComponent from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { useAppTheme } from '@theme';

import { FormRow } from './Form';
import { dateFromDay, dayFromDate } from './form-date';

export interface FormDateRowProps {
  label: string;
  /** A local calendar day as YYYY-MM-DD. */
  value: string;
  onChange: (value: string) => void;
  maximumDate?: string;
  testID?: string;
}

/** A form row with the system's compact date control. */
export function FormDateRow({ label, value, onChange, maximumDate, testID }: FormDateRowProps) {
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
            maximumDate={maximumDate ? dateFromDay(maximumDate) : undefined}
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
            maximumDate={maximumDate ? dateFromDay(maximumDate) : undefined}
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
