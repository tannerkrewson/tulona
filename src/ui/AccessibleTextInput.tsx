import { TextInput, type TextInputProps } from '@expo/ui';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';

export interface AccessibleTextInputProps extends TextInputProps {
  label: string;
}

/** Associates the visible field label with Expo's cross-platform text input. */
export function AccessibleTextInput({ label, testID, ...inputProps }: AccessibleTextInputProps) {
  useEffect(() => {
    if (typeof document === 'undefined' || !testID) return;
    const applyLabel = () => {
      const input = Array.from(document.querySelectorAll('input, textarea')).find(
        (candidate) => candidate.getAttribute('data-testid') === testID
      );
      if (!input) return false;
      input.setAttribute('aria-label', label);
      return true;
    };
    applyLabel();
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const retry = () => {
      applyLabel();
      if (attempts++ < 20) retryTimer = setTimeout(retry, 50);
    };
    retry();
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(applyLabel);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['aria-label', 'data-testid'],
      childList: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [label, testID]);

  return (
    <View accessibilityLabel={Platform.OS === 'web' ? undefined : label} style={{ width: '100%' }}>
      <TextInput
        {...inputProps}
        testID={testID}
        style={{ height: 48, width: '100%', ...inputProps.style }}
      />
    </View>
  );
}
