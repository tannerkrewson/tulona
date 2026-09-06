import { isIOSSafariEnvironment } from '../src/ui/platform-detection';

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const html = read('app/+html.tsx');
const tabs = read('app/(tabs)/_layout.tsx');
const activeBar = read('src/tracker/ActiveActivityBar.tsx');
const systemColorScheme = read('src/theme/systemColorScheme.ts');

const safariUA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1';
const pwaUA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const chromeIOSUA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 CriOS/140.0.7339.101 Mobile/15E148 Safari/604.1';

assert(
  isIOSSafariEnvironment({
    userAgent: safariUA,
    platform: 'iPhone',
    maxTouchPoints: 5,
    standalone: false,
  }),
  'iOS Safari must receive the safe area'
);
assert(
  isIOSSafariEnvironment({
    userAgent: pwaUA,
    platform: 'iPhone',
    maxTouchPoints: 5,
    standalone: true,
  }),
  'an installed iOS PWA must receive the safe area even without Safari in its UA'
);
assert(
  !isIOSSafariEnvironment({
    userAgent: chromeIOSUA,
    platform: 'iPhone',
    maxTouchPoints: 5,
    standalone: false,
  }),
  'iOS Chrome must not receive Safari-only safe-area styling'
);
assert(
  !isIOSSafariEnvironment({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
    platform: 'Linux x86_64',
    maxTouchPoints: 0,
    standalone: false,
  }),
  'desktop Chromium must not receive the iOS safe area'
);
assert(
  isIOSSafariEnvironment({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15',
    platform: 'MacIntel',
    maxTouchPoints: 5,
    standalone: false,
  }),
  'iPadOS desktop-mode Safari must receive the safe area'
);
assert(
  !isIOSSafariEnvironment({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15',
    platform: 'MacIntel',
    maxTouchPoints: 0,
    standalone: true,
  }),
  'a desktop browser must not opt into the safe area from standalone alone'
);

assert(
  html.includes('viewport-fit=cover'),
  'the viewport must allow the iOS safe area to be exposed'
);
assert(
  html.includes(
    "'--tulona-safe-area-bottom',\n                    'env(safe-area-inset-bottom, 0px)'"
  ),
  'the bootstrap must opt into env() only for iOS Safari/PWA'
);
assert(
  html.includes('--tulona-safe-area-bottom: 0px'),
  'the default safe-area token must be zero for non-iOS web targets'
);
assert(
  tabs.includes('const iOSSafari = isIOSSafari()') &&
    tabs.includes('height: iOSSafari ?') &&
    tabs.includes('paddingBottom: iOSSafari ?'),
  'the tab bar must conditionally apply the inset'
);
assert(
  tabs.includes('var(--tulona-tab-active)') && tabs.includes('var(--tulona-tab-inactive)'),
  'tab tints must use live theme variables on web'
);
assert(
  tabs.includes('focused ? webTabActive : webTabInactive'),
  'web tab icons must use live active/inactive theme variables'
);
assert(
  activeBar.includes("bottom: pathname === '/' ? 82 : 14") && !activeBar.includes('safeAreaBottom'),
  'the floating activity bar must not add a safe-area gap'
);
assert(
  systemColorScheme.includes("window.addEventListener('pageshow', sync)") &&
    systemColorScheme.includes('media.addListener?.(sync)'),
  'system theme changes must resync after a page return and legacy media-query events'
);

console.log('Validated iOS Safari/PWA safe-area gating and live tab-theme regression guards.');
