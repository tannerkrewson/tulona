const assert = require('node:assert/strict');

const {
  DIAGNOSTIC_MARKER,
  patchAppDelegateSource,
} = require('./native-exception-diagnostic-patch.cjs');

const source = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

const patched = patchAppDelegateSource(source);
assert(patched.includes(DIAGNOSTIC_MARKER), 'adds a marker for native binary verification');
assert(
  patched.includes('NSSetUncaughtExceptionHandler(tulonaHandleUncaughtException)'),
  'installs the uncaught exception reporter before starting React Native'
);
assert(patched.includes('exception.callStackSymbols'), 'captures native stack symbols');
assert.equal(patchAppDelegateSource(patched), patched, 'patching is idempotent');
assert.throws(
  () => patchAppDelegateSource('unexpected AppDelegate source'),
  /expected Expo AppDelegate import anchor/
);

console.log('Native exception diagnostic patch tests passed');
