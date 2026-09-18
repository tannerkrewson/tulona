import { Column, Text } from '@expo/ui';
import { useCallback, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  findNodeHandle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@theme';

import { AppButton } from './AppButton';

export interface ConfirmationModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  cancelAccessibilityHint?: string;
  onConfirm: () => void;
  onCancel: () => void;
  testID: string;
  confirmTestID: string;
  cancelTestID: string;
  busy?: boolean;
  tone?: 'warning' | 'danger';
}

/** A dependency-free, accessible confirmation surface for destructive or irreversible actions. */
export function ConfirmationModal({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  testID,
  confirmTestID,
  cancelTestID,
  busy = false,
  cancelAccessibilityHint,
  tone = 'warning',
}: ConfirmationModalProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const toneColors = tone === 'danger' ? colors.danger : colors.warning;
  const titleRef = useRef<View>(null);

  const focusTitle = useCallback(() => {
    if (Platform.OS === 'web') return;
    const focusTarget = findNodeHandle(titleRef.current);
    if (focusTarget !== null) AccessibilityInfo.setAccessibilityFocus(focusTarget);
  }, []);

  useEffect(() => {
    if (!visible) return;
    Keyboard.dismiss();
    const focusTimer = setTimeout(() => {
      focusTitle();
    }, 100);
    return () => clearTimeout(focusTimer);
  }, [focusTitle, message, title, visible]);

  const dismiss = () => {
    if (!busy) onCancel();
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={dismiss}
      onShow={focusTitle}
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.root, { paddingBottom: 20 + insets.bottom, paddingTop: 20 + insets.top }]}
      >
        <Pressable
          accessibilityHint={
            cancelAccessibilityHint ?? 'Dismisses this confirmation without making changes'
          }
          accessibilityLabel="Cancel confirmation"
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={dismiss}
          style={styles.scrim}
        />
        <View
          accessibilityViewIsModal
          importantForAccessibility="yes"
          style={[
            styles.dialog,
            {
              backgroundColor: toneColors.background,
              borderColor: toneColors.foreground,
            },
          ]}
          testID={testID}
        >
          <Column spacing={12} style={{ width: '100%' }}>
            <View
              accessible
              accessibilityLabel={`${title}. ${message}`}
              accessibilityRole="header"
              ref={titleRef}
            >
              <Text textStyle={{ color: toneColors.foreground, fontSize: 19, fontWeight: '700' }}>
                {title}
              </Text>
            </View>
            <Text textStyle={{ color: toneColors.foreground, fontSize: 15, lineHeight: 21 }}>
              {message}
            </Text>
            <Column spacing={8} style={{ width: '100%' }}>
              <AppButton
                disabled={busy}
                label={confirmLabel}
                onPress={onConfirm}
                style={{ height: 48, width: '100%' }}
                testID={confirmTestID}
              />
              <AppButton
                disabled={busy}
                label={cancelLabel}
                onPress={dismiss}
                style={{ height: 48, width: '100%' }}
                testID={cancelTestID}
                variant="outlined"
              />
            </Column>
          </Column>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  scrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.46)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  dialog: {
    alignSelf: 'center',
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: 560,
    padding: 20,
    width: '100%',
  },
});
