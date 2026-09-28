import type { ReactNode } from 'react';

export interface AppScreenProps {
  onBack?: () => void;
  children: ReactNode;
  title?: string;
  headerRight?: ReactNode;
  scrollable?: boolean;
  testID?: string;
  backgroundColor?: string;
  /** Set false when the screen body is entirely React Native UI. */
  hostContent?: boolean;
}
