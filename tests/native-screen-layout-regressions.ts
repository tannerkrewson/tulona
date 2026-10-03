/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath: string) => fs.existsSync(path.join(root, relativePath));
const appScreen = read('src/ui/AppScreen.tsx');
const primitives = read('src/ui/primitives.tsx');
const settingsScreen = read('src/settings/SettingsScreen.tsx');
const habitScreen = read('src/habits/HabitListScreen.tsx');

assert(
  appScreen.includes("import { ReorderScrollView as ScrollView } from './ReorderScrollView'") &&
    !appScreen.includes("from '@expo/ui'") &&
    appScreen.includes('contentInsetAdjustmentBehavior="automatic"') &&
    appScreen.includes('keyboardShouldPersistTaps="handled"') &&
    !exists('src/ui/AppScreen.native.tsx'),
  'screens must use one React Native scroll shell that lets UIKit inset for the tab bar and accessory'
);
assert(
  appScreen.includes('<SafeAreaView') &&
    appScreen.includes("['top', 'left', 'right', 'bottom']") &&
    appScreen.includes('<PageHeader onBack={onBack} title={title}>'),
  'fixed-height screens must stop above system chrome and keep the page header in React Native layout'
);
assert(
  !primitives.includes("from '@expo/ui'") &&
    primitives.includes('RNScrollView') &&
    !exists('src/ui/SwiftUIReactView.tsx') &&
    !exists('src/ui/SwiftUIReactView.ios.tsx'),
  'layout primitives must be React Native views so native controls only host SwiftUI at the leaves'
);
assert(
  habitScreen.includes('<Screen scrollable={false} underBottomChrome testID="habits-screen">') &&
    settingsScreen.includes('<Screen title="Settings">'),
  'the habits pager and Settings menu must use the shared React Native screen shell'
);

console.log('Validated native screen layout, React Native primitives, and screen shell usage.');
