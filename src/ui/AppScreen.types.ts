import type { ReactNode } from 'react';

export interface AppScreenProps {
  onBack?: () => void;
  children: ReactNode;
  title?: string;
  headerRight?: ReactNode;
  scrollable?: boolean;
  /** Let inner scroll views draw beneath the translucent tab bar and accessory. */
  underBottomChrome?: boolean;
  testID?: string;
  backgroundColor?: string;
}
