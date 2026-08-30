import type { ReactNode } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

import { basePathAsset } from '@/src/pwa/basePath';

export default function RootHtml({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Tulona</title>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#102033" />
        <link rel="manifest" href={basePathAsset('manifest.json')} />
        <link rel="icon" href={basePathAsset('favicon.png')} />
        <link rel="apple-touch-icon" href={basePathAsset('icons/apple-touch-icon.png')} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                const path = window.location.pathname;
                if (!path.endsWith('.html')) return;
                const withoutExtension = path.slice(0, -'.html'.length);
                const normalizedPath = withoutExtension.endsWith('/index')
                  ? withoutExtension.slice(0, -'/index'.length) || '/'
                  : withoutExtension;
                window.history.replaceState(
                  null,
                  '',
                  normalizedPath + window.location.search + window.location.hash
                );
              })();
            `,
          }}
        />
        <style>{`
          .skip-link {
            position: absolute;
            left: -10000px;
            top: auto;
            width: 1px;
            height: 1px;
            overflow: hidden;
          }
          .skip-link:focus {
            left: 16px;
            top: 16px;
            width: auto;
            height: auto;
            padding: 8px 12px;
            background: #ffffff;
            color: #102033;
            z-index: 1000;
          }
        `}</style>
        <ScrollViewStyleReset />
      </head>
      <body style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <a className="skip-link" href="#root">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
