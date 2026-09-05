import { Platform } from 'react-native';

/** Identifies Safari itself so CSS safe-area padding is not added to desktop or alternate iOS browsers. */
export function isIOSSafari(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/i.test(userAgent);
  const isOtherIOSBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA|DuckDuckGo/i.test(userAgent);
  return isIOS && isSafari && !isOtherIOSBrowser;
}
