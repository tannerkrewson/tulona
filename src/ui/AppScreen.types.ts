import type { ReactNode } from 'react';

export interface AppScreenProps {
  onBack?: () => void;
  children: ReactNode;
  title?: string;
  headerRight?: ReactNode;
  scrollable?: boolean;
  testID?: string;
  backgroundColor?: string;
}
