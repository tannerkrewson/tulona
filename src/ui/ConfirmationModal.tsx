import { useCallback, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  findNodeHandle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@theme';

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
          <View style={styles.content}>
            <View
              accessible
              accessibilityLabel={`${title}. ${message}`}
              accessibilityRole="header"
              ref={titleRef}
            >
              <Text style={{ color: toneColors.foreground, fontSize: 19, fontWeight: '700' }}>
                {title}
              </Text>
            </View>
            <Text style={{ color: toneColors.foreground, fontSize: 15, lineHeight: 21 }}>
              {message}
            </Text>
            <View style={styles.actions}>
              <ModalActionButton
                disabled={busy}
                label={confirmLabel}
                onPress={onConfirm}
                testID={confirmTestID}
              />
              <ModalActionButton
                disabled={busy}
                label={cancelLabel}
                onPress={dismiss}
                testID={cancelTestID}
                variant="outlined"
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ModalActionButton({
  label,
  onPress,
  testID,
  disabled,
  variant = 'filled',
}: {
  label: string;
  onPress: () => void;
  testID: string;
  disabled: boolean;
  variant?: 'filled' | 'outlined';
}) {
  const { colors } = useAppTheme();
  const filled = variant === 'filled';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: filled ? colors.primary : 'transparent',
        borderColor: filled ? colors.primary : colors.border,
        borderRadius: 12,
        borderWidth: filled ? 0 : 1,
        height: 48,
        justifyContent: 'center',
        opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
        paddingHorizontal: 16,
        width: '100%',
      })}
      testID={testID}
    >
      <Text style={{ color: filled ? colors.onPrimary : colors.text, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
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
  content: { gap: 12, width: '100%' },
  actions: { gap: 8, width: '100%' },
});
