const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  DIAGNOSTIC_FILENAME,
  PATCH_MARKER,
  patchTurboModuleSource,
} = require('./turbo-module-diagnostic-patch.cjs');

const originalCatch = `      // Void methods are always async, re-throw instead of converting to
      // JSError, same as the async branch in performMethodInvocation.
      @throw addModuleIdentityToException(exception, std::string{moduleName}, methodNameStr);`;
const source = `#import <React/RCTUtils.h>\nvoid invoke() {\n  @catch (NSException *exception) {\n${originalCatch}\n  }\n}`;
const patchedSource = patchTurboModuleSource(source);

assert.match(patchedSource, new RegExp(PATCH_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(patchedSource, /#import <React\/RCTLog\.h>/);
assert.match(patchedSource, /exception\.reason/);
assert.match(patchedSource, /NSJSONSerialization/);
assert.match(patchedSource, new RegExp(DIAGNOSTIC_FILENAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(patchedSource, /return;/);
assert.doesNotMatch(patchedSource, /@throw addModuleIdentityToException/);
assert.equal(patchTurboModuleSource(patchedSource), patchedSource, 'patching is idempotent');
assert.throws(
  () => patchTurboModuleSource('unexpected React Native source'),
  /expected React Native async void TurboModule exception handler/
);

const reactNativeSourcePath = path.join(
  process.cwd(),
  'node_modules/react-native/ReactCommon/react/nativemodule/core/platform/ios/ReactCommon/RCTTurboModule.mm'
);
const reactNativeSource = fs.readFileSync(reactNativeSourcePath, 'utf8');
const patchedReactNativeSource = patchTurboModuleSource(reactNativeSource);
const functionStart = patchedReactNativeSource.indexOf(
  'void ObjCTurboModule::performVoidMethodInvocation('
);
const functionEnd = patchedReactNativeSource.indexOf(
  '\njsi::Value ObjCTurboModule::convertReturnIdToJSIValue(',
  functionStart
);
assert(functionStart >= 0 && functionEnd > functionStart, 'locates the pinned RN native function');
const patchedFunction = patchedReactNativeSource.slice(functionStart, functionEnd);
assert(patchedFunction.includes(PATCH_MARKER), 'patches the real installed React Native source');
assert(patchedFunction.includes(DIAGNOSTIC_FILENAME), 'persists native exception details');
assert(!patchedFunction.includes('@throw addModuleIdentityToException'));

console.log('TurboModule diagnostic patch tests passed');
