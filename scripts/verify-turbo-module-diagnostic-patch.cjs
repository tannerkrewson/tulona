const fs = require('node:fs');
const path = require('node:path');

const { DIAGNOSTIC_FILENAME, PATCH_MARKER } = require('./turbo-module-diagnostic-patch.cjs');

const sourcePath = path.join(
  process.cwd(),
  'node_modules/react-native/ReactCommon/react/nativemodule/core/platform/ios/ReactCommon/RCTTurboModule.mm'
);
const source = fs.readFileSync(sourcePath, 'utf8');
const infoPlistPath = path.join(process.cwd(), 'ios/Tulona/Info.plist');
const infoPlist = fs.readFileSync(infoPlistPath, 'utf8');
const functionStart = source.indexOf('void ObjCTurboModule::performVoidMethodInvocation(');
const functionEnd = source.indexOf(
  '\njsi::Value ObjCTurboModule::convertReturnIdToJSIValue(',
  functionStart
);

if (functionStart < 0 || functionEnd < 0) {
  throw new Error('Could not locate performVoidMethodInvocation in React Native source');
}

const functionSource = source.slice(functionStart, functionEnd);
if (
  !functionSource.includes(PATCH_MARKER) ||
  functionSource.includes('@throw addModuleIdentityToException') ||
  !functionSource.includes(DIAGNOSTIC_FILENAME) ||
  !functionSource.includes('NSJSONSerialization') ||
  !source.includes('#import <React/RCTLog.h>')
) {
  throw new Error('The diagnostic TurboModule exception workaround was not applied');
}
if (
  !infoPlist.includes('<key>TULONA_BUILD_SHA</key>') ||
  (process.env.EXPO_PUBLIC_BUILD_SHA && !infoPlist.includes(process.env.EXPO_PUBLIC_BUILD_SHA))
) {
  throw new Error('The native diagnostic report is missing the build SHA from Info.plist');
}

console.log('Verified native TurboModule catch, durable diagnostic report, and build SHA');
