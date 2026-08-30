import type { ReactNode } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

import { basePathAsset } from '@/src/pwa/basePath';

export default function RootHtml({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#102033" />
        <link rel="manifest" href={basePathAsset('manifest.json')} />
        <link rel="icon" href={basePathAsset('favicon.png')} />
        <link rel="apple-touch-icon" href={basePathAsset('icons/apple-touch-icon.png')} />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
