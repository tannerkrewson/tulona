import { Column, Host, Row, Text } from '@expo/ui';
import DateTimePickerComponent from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text as NativeText, View } from 'react-native';

import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';
import { AppButton } from '@ui';

export interface GoalStartWeekPickerProps {
  value: Date;
  valueLabel: string;
  maximumDate: Date;
  onValueChange: (date: Date) => void;
}

export function GoalStartWeekPicker({
  value,
  valueLabel,
  maximumDate,
  onValueChange,
}: GoalStartWeekPickerProps) {
  const { colorScheme, colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  const confirm = () => {
    onValueChange(draft);
    setOpen(false);
  };

  return (
    <Column spacing={8} style={{ width: '100%' }}>
      <Row alignment="center" spacing={8} style={{ width: '100%' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <NativeText
            numberOfLines={1}
            style={{ color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 18 }}
            testID="goal-start-week-range"
          >
            {valueLabel}
          </NativeText>
        </View>
        {Platform.OS !== 'web' ? (
          <Pressable
            accessibilityLabel={`Change starting week, currently ${valueLabel}`}
            accessibilityRole="button"
            onPress={() => {
              setDraft(value);
              setOpen(true);
            }}
            style={({ pressed }) => ({
              alignItems: 'center',
              backgroundColor: colors.surfaceMuted,
              borderColor: colors.border,
              borderRadius: 10,
              borderWidth: 1,
              flexDirection: 'row',
              gap: 7,
              flexShrink: 0,
              height: 42,
              justifyContent: 'center',
              minWidth: 108,
              opacity: pressed ? 0.78 : 1,
              paddingHorizontal: 10,
              width: 108,
            })}
            testID="goal-start-week-change"
          >
            <AppIcon color={colors.textMuted} name="calendar-days" size={16} />
            <NativeText style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
              Change
            </NativeText>
          </Pressable>
        ) : null}
      </Row>
      {Platform.OS === 'android' && open ? (
        <DateTimePickerComponent
          accentColor={colors.primary}
          display="default"
          maximumDate={maximumDate}
          mode="date"
          negativeButton={{ label: 'Cancel' }}
          onDismiss={() => setOpen(false)}
          onValueChange={(_event, date) => {
            if (Number.isFinite(date.getTime())) onValueChange(date);
            setOpen(false);
          }}
          positiveButton={{ label: 'Select' }}
          presentation="dialog"
          testID="goal-start-week-native-picker"
          value={value}
        />
      ) : null}
      {Platform.OS === 'ios' && open ? (
        <Modal animationType="slide" onRequestClose={() => setOpen(false)} transparent visible>
          <View style={styles.modalRoot}>
            <Pressable
              accessibilityLabel="Cancel starting week picker"
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              style={styles.scrim}
            />
            <View
              accessibilityViewIsModal
              importantForAccessibility="yes"
              style={[styles.modalSurface, { backgroundColor: colors.surface }]}
              testID="goal-start-week-picker-modal"
            >
              <Host colorScheme={colorScheme} seedColor={colors.primary} style={{ width: '100%' }}>
                <Column spacing={12} style={{ width: '100%' }}>
                  <Text textStyle={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>
                    Starting week
                  </Text>
                  <View style={{ alignItems: 'center', overflow: 'hidden', width: '100%' }}>
                    <Host style={{ width: '100%' }}>
                      <DateTimePickerComponent
                        accentColor={colors.primary}
                        display="spinner"
                        maximumDate={maximumDate}
                        mode="date"
                        onDismiss={() => setOpen(false)}
                        onValueChange={(_event, date) => {
                          if (Number.isFinite(date.getTime())) setDraft(date);
                        }}
                        style={{ width: '100%' }}
                        testID="goal-start-week-native-picker"
                        themeVariant={colorScheme}
                        value={draft}
                      />
                    </Host>
                  </View>
                  <Row alignment="center" spacing={8} style={{ width: '100%' }}>
                    <AppButton
                      onPress={() => setOpen(false)}
                      style={{ height: 44, paddingHorizontal: 8, width: '48%' }}
                      testID="goal-start-week-cancel"
                      variant="outlined"
                    >
                      <Text textStyle={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
                        Cancel
                      </Text>
                    </AppButton>
                    <AppButton
                      onPress={confirm}
                      style={{ height: 44, paddingHorizontal: 8, width: '48%' }}
                      testID="goal-start-week-confirm"
                    >
                      <Text
                        textStyle={{ color: colors.onPrimary, fontSize: 14, fontWeight: '600' }}
                      >
                        Select week
                      </Text>
                    </AppButton>
                  </Row>
                </Column>
              </Host>
            </View>
          </View>
        </Modal>
      ) : null}
    </Column>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 20,
  },
  scrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.46)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  modalSurface: {
    alignSelf: 'center',
    borderRadius: 18,
    maxWidth: 560,
    padding: 20,
    width: '100%',
  },
});
