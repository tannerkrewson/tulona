const DIAGNOSTIC_MARKER = '[Tulona diagnostic] Uncaught NSException';
const REPORT_FILENAME = 'tulona-native-turbo-module-diagnostic.json';

const DIAGNOSTIC_HELPER = `

// ${DIAGNOSTIC_MARKER}
private func tulonaHandleUncaughtException(_ exception: NSException) {
  let info = Bundle.main.infoDictionary ?? [:]
  let report: [String: Any] = [
    "schemaVersion": 1,
    "kind": "native-objc-exception",
    "capturedAt": ISO8601DateFormatter().string(from: Date()),
    "appVersion": info["CFBundleShortVersionString"] as? String ?? "unknown",
    "buildNumber": info["CFBundleVersion"] as? String ?? "unknown",
    "buildSha": info["TULONA_BUILD_SHA"] as? String ?? "unknown",
    "bundleIdentifier": Bundle.main.bundleIdentifier ?? "unknown",
    "platformVersion": ProcessInfo.processInfo.operatingSystemVersionString,
    "exceptionName": exception.name.rawValue,
    "reason": exception.reason ?? "(no reason)",
    "stackSymbols": Array(exception.callStackSymbols.prefix(100)),
  ]

  guard
    let data = try? JSONSerialization.data(withJSONObject: report, options: []),
    let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
  else {
    NSLog("${DIAGNOSTIC_MARKER}: could not serialize report")
    return
  }

  let reportURL = documents.appendingPathComponent("${REPORT_FILENAME}")
  do {
    try data.write(to: reportURL, options: .atomic)
    NSLog("${DIAGNOSTIC_MARKER}: %@: %@", exception.name.rawValue, exception.reason ?? "(no reason)")
  } catch {
    NSLog("${DIAGNOSTIC_MARKER}: could not save report: %@", error.localizedDescription)
  }
}
`;

function patchAppDelegateSource(source) {
  if (source.includes(DIAGNOSTIC_MARKER)) return source;

  const importAnchor = 'import ReactAppDependencyProvider';
  if (!source.includes(importAnchor)) {
    throw new Error('Could not find the expected Expo AppDelegate import anchor');
  }

  const launchAnchor = '    let delegate = ReactNativeDelegate()';
  if (!source.includes(launchAnchor)) {
    throw new Error('Could not find the expected Expo AppDelegate launch anchor');
  }

  return source
    .replace(importAnchor, `${importAnchor}${DIAGNOSTIC_HELPER}`)
    .replace(
      launchAnchor,
      `    NSSetUncaughtExceptionHandler(tulonaHandleUncaughtException)\n\n${launchAnchor}`
    );
}

module.exports = { DIAGNOSTIC_MARKER, patchAppDelegateSource };
