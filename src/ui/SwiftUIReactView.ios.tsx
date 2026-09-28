import { RNHostView } from '@expo/ui';
import type { ReactNode } from 'react';
import { View } from 'react-native';

/** Bridges a React Native subtree placed inside an Expo SwiftUI host. */
export function SwiftUIReactView({ children }: { children: ReactNode }) {
  return (
    <RNHostView matchContents>
      <View collapsable={false} style={{ width: '100%' }}>
        {children}
      </View>
    </RNHostView>
  );
}
