import { ActionSheetIOS, Alert, Keyboard, Platform } from 'react-native';

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

export interface ActionSheetOption {
  label: string;
  destructive?: boolean;
}

export interface ChooseActionOptions {
  title: string;
  message?: string;
  actions: readonly ActionSheetOption[];
  cancelLabel?: string;
}

/** Shows a native action sheet and resolves the chosen action index, or null when cancelled. */
export function chooseAction({
  title,
  message,
  actions,
  cancelLabel = 'Cancel',
}: ChooseActionOptions): Promise<number | null> {
  if (Platform.OS === 'web') {
    const prompt = (globalThis as { prompt?: (text: string) => string | null }).prompt;
    const list = actions.map((action, index) => `${index + 1}. ${action.label}`).join('\n');
    const answer = prompt?.(`${title}${message ? `\n${message}` : ''}\n\n${list}`);
    const index = answer ? Number.parseInt(answer, 10) - 1 : -1;
    return Promise.resolve(index >= 0 && index < actions.length ? index : null);
  }
  if (Platform.OS === 'ios') {
    return new Promise((resolve) => {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex: actions.length,
          destructiveButtonIndex: actions.flatMap((action, index) =>
            action.destructive ? [index] : []
          ),
          message,
          options: [...actions.map((action) => action.label), cancelLabel],
          title,
        },
        (index) => resolve(index < actions.length ? index : null)
      );
    });
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        ...actions.map((action, index) => ({
          onPress: () => resolve(index),
          style: action.destructive ? ('destructive' as const) : ('default' as const),
          text: action.label,
        })),
        { onPress: () => resolve(null), style: 'cancel' as const, text: cancelLabel },
      ],
      { cancelable: true, onDismiss: () => resolve(null) }
    );
  });
}
