/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const nativeScreen = read('src/ui/AppScreen.native.tsx');
const swiftUIReactView = read('src/ui/SwiftUIReactView.ios.tsx');
const settingsScreen = read('src/settings/SettingsScreen.tsx');
const habitScreen = read('src/habits/HabitListScreen.tsx');

assert(
  nativeScreen.includes("import { ScrollView, StyleSheet, View } from 'react-native'") &&
    !nativeScreen.includes("ScrollView } from '@expo/ui'") &&
    !nativeScreen.includes('import { Column') &&
    nativeScreen.includes('keyboardShouldPersistTaps="handled"'),
  'native screens must use the React Native scroll shell so screen controls retain normal UIKit touch routing'
);
assert(
  nativeScreen.includes('<PageHeader onBack={onBack} title={title}>') &&
    nativeScreen.includes('hostContent = true') &&
    nativeScreen.includes('{content}'),
  'native page headers must remain in the React Native layout while feature SwiftUI content is hosted explicitly'
);
assert(
  swiftUIReactView.includes('<RNHostView matchContents>') &&
    swiftUIReactView.includes("<View collapsable={false} style={{ width: '100%' }}>") &&
    habitScreen.includes('<Screen hostContent={false} scrollable={false} testID="habits-screen">'),
  'interactive React Native subtrees must use Expo’s iOS host bridge, while the habits shell stays UIKit-native'
);
assert(
  settingsScreen.includes('<Screen hostContent={false} title="Settings">'),
  'the React Native-only Settings menu must remain outside the SwiftUI content host'
);

console.log(
  'Validated native screen layout, hosted feature content, and Settings visibility boundaries.'
);
