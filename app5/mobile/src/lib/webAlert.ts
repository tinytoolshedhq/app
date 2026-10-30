import { Alert, Platform } from 'react-native';

type AlertButton = {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

/** react-native-web's Alert.alert is a no-op. Map it to window.alert / confirm. */
export function webAlert(title: string, message?: string, buttons?: AlertButton[]) {
  const text = [title, message].filter(Boolean).join('\n\n');
  const list = Array.isArray(buttons) ? buttons : [];
  if (list.length < 2) {
    window.alert(text);
    list[0]?.onPress?.();
    return;
  }
  const cancel = list.find((b) => b.style === 'cancel');
  const action = list.find((b) => b !== cancel) || list[list.length - 1];
  if (window.confirm(text)) action?.onPress?.();
  else cancel?.onPress?.();
}

export function installWebAlert() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  Alert.alert = webAlert as typeof Alert.alert;
  return true;
}
