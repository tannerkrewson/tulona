import { Platform } from 'react-native';
import { isIOSSafariEnvironment } from './platform-detection';

export { isIOSSafariEnvironment, type IOSWebEnvironment } from './platform-detection';

export function isIOSSafari(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;

  const browserNavigator = navigator as Navigator & {
    standalone?: boolean;
  };
  return isIOSSafariEnvironment({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: browserNavigator.standalone === true,
    displayModeStandalone:
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches,
  });
}
