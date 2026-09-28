import type { ReactNode } from 'react';

/** No-op outside iOS SwiftUI hosting; keeps the PWA's DOM layout unchanged. */
export function SwiftUIReactView({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
