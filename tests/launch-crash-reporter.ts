import {
  createLaunchCrashReport,
  formatLaunchCrashReport,
  installLaunchCrashReporter,
  LAUNCH_CRASH_REPORT_KEY,
  parseLaunchCrashReport,
  type CrashReportMetadata,
  type ErrorHandler,
} from '../src/diagnostics/launchCrashReporter';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertMatch(value: string, pattern: RegExp, message: string) {
  if (!pattern.test(value)) throw new Error(message);
}

async function run() {
  const metadata: CrashReportMetadata = {
    appVersion: '0.1.0',
    buildNumber: '1',
    buildSha: 'abc123',
    bundleIdentifier: 'com.tannerkrewson.tulona',
    platform: 'ios',
    platformVersion: '27.0',
  };

  const sourceError = new Error('startup failed');
  const report = createLaunchCrashReport(
    sourceError,
    metadata,
    new Date('2026-09-27T20:00:00.000Z')
  );
  assertEqual(report.name, 'Error', 'captures error name');
  assertEqual(report.message, 'startup failed', 'captures error message');
  assertEqual(report.capturedAt, '2026-09-27T20:00:00.000Z', 'captures timestamp');
  assertEqual(
    parseLaunchCrashReport(JSON.stringify(report))?.buildSha,
    'abc123',
    'round trips report'
  );
  assertEqual(parseLaunchCrashReport('{not json'), null, 'rejects malformed report');
  assertEqual(parseLaunchCrashReport(null), null, 'handles missing report');
  assertMatch(formatLaunchCrashReport(report), /startup failed/, 'formats error message');
  assertMatch(formatLaunchCrashReport(report), /Build commit: abc123/, 'formats build commit');

  const saved = new Map<string, string>();
  let delegatedError: unknown;
  let delegatedFatal: boolean | undefined;
  let installedHandler: ErrorHandler | undefined;
  const originalHandler: ErrorHandler = (error, isFatal) => {
    delegatedError = error;
    delegatedFatal = isFatal;
  };
  const errorUtils = {
    getGlobalHandler: () => originalHandler,
    setGlobalHandler: (handler: ErrorHandler) => {
      installedHandler = handler;
    },
  };

  assertEqual(
    installLaunchCrashReporter({
      errorUtils,
      metadata,
      storage: {
        async setItem(key, value) {
          saved.set(key, value);
        },
      },
    }),
    true,
    'installs reporter when React Native has an existing handler'
  );
  assert(installedHandler, 'stores the installed error handler');

  const fatalError = new Error('fatal boot issue');
  installedHandler(fatalError, true);
  assertEqual(delegatedError, undefined, 'fatal handling waits for durable storage');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEqual(delegatedError, fatalError, 'the original handler is called after storage');
  assertEqual(delegatedFatal, true, 'preserves fatal flag');
  const storedReport = parseLaunchCrashReport(saved.get(LAUNCH_CRASH_REPORT_KEY) ?? null);
  assertEqual(storedReport?.message, 'fatal boot issue', 'persists fatal message');

  let storageFailureDelegated = false;
  let failureHandler: ErrorHandler | undefined;
  const failureErrorUtils = {
    getGlobalHandler: () => () => {
      storageFailureDelegated = true;
    },
    setGlobalHandler: (handler: ErrorHandler) => {
      failureHandler = handler;
    },
  };
  installLaunchCrashReporter({
    errorUtils: failureErrorUtils,
    metadata,
    storage: {
      setItem() {
        return Promise.reject(new Error('storage unavailable'));
      },
    },
  });
  failureHandler?.(new Error('another fatal'), true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEqual(storageFailureDelegated, true, 'storage failures still reach React Native');

  assertEqual(
    installLaunchCrashReporter({
      errorUtils: { setGlobalHandler: () => {} },
      metadata,
      storage: { setItem: async () => undefined },
    }),
    false,
    'the reporter does not replace a missing prior handler'
  );

  console.log('Launch crash reporter tests passed');
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
