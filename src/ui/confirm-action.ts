import { Alert, Keyboard, Platform } from 'react-native';

export interface ConfirmActionOptions {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/** Asks with the platform's own alert and resolves true only when the user confirms. */
export function confirmAction({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
}: ConfirmActionOptions): Promise<boolean> {
  if (Platform.OS === 'web') {
    const confirm = (globalThis as { confirm?: (text: string) => boolean }).confirm;
    return Promise.resolve(confirm ? confirm(message ? `${title}\n\n${message}` : title) : false);
  }
  Keyboard.dismiss();
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
