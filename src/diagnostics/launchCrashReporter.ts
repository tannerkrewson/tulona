export const LAUNCH_CRASH_REPORT_KEY = '@tulona/diagnostics/last-fatal-js-error';

const REPORT_SCHEMA_VERSION = 1;
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_STACK_LENGTH = 24_000;
const PERSIST_TIMEOUT_MS = 1_500;

export type LaunchCrashReport = {
  schemaVersion: 1;
  capturedAt: string;
  appVersion: string;
  buildNumber: string;
  buildSha: string;
  bundleIdentifier: string;
  platform: string;
  platformVersion: string;
  name: string;
  message: string;
  stack: string;
  isFatal: true;
};

export type NativeTurboModuleReport = {
  schemaVersion: 1;
  kind: 'native-turbo-module';
  capturedAt: string;
  appVersion: string;
  buildNumber: string;
  buildSha: string;
  bundleIdentifier: string;
  platformVersion: string;
  moduleName: string;
  methodName: string;
  exceptionName: string;
  reason: string;
  stackSymbols: string[];
};

export type LaunchDiagnosticReport = LaunchCrashReport | NativeTurboModuleReport;

export const NATIVE_TURBOMODULE_REPORT_FILENAME = 'tulona-native-turbo-module-diagnostic.json';

export type ErrorHandler = (error: unknown, isFatal?: boolean) => void;

export type ErrorUtilsLike = {
  getGlobalHandler?: () => ErrorHandler;
  setGlobalHandler: (handler: ErrorHandler) => void;
};

export type CrashReportStorage = {
  setItem: (key: string, value: string) => Promise<unknown>;
};

export type CrashReportMetadata = Omit<
  LaunchCrashReport,
  'schemaVersion' | 'capturedAt' | 'name' | 'message' | 'stack' | 'isFatal'
>;

function safeProperty(value: unknown, property: string): unknown {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return undefined;
  }

  try {
    return (value as Record<string, unknown>)[property];
  } catch {
    return undefined;
  }
}

function safeString(value: unknown, fallback: string): string {
  try {
    if (typeof value === 'string') return value;
    if (value === undefined || value === null) return fallback;
    return String(value);
  } catch {
    return fallback;
  }
}

function bounded(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}\n[truncated]`;
}

export function createLaunchCrashReport(
  error: unknown,
  metadata: CrashReportMetadata,
  now: Date = new Date()
): LaunchCrashReport {
  const rawName = safeString(safeProperty(error, 'name'), 'Error');
  const rawMessage = safeString(
    safeProperty(error, 'message'),
    safeString(error, 'Unknown JavaScript error')
  );
  const rawStack = safeString(safeProperty(error, 'stack'), '');

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    capturedAt: now.toISOString(),
    ...metadata,
    name: bounded(rawName, 200),
    message: bounded(rawMessage, MAX_MESSAGE_LENGTH),
    stack: bounded(rawStack, MAX_STACK_LENGTH),
    isFatal: true,
  };
}

export function parseLaunchCrashReport(value: string | null): LaunchCrashReport | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const report = parsed as Partial<LaunchCrashReport>;
    if (
      report.schemaVersion !== REPORT_SCHEMA_VERSION ||
      report.isFatal !== true ||
      typeof report.capturedAt !== 'string' ||
      typeof report.appVersion !== 'string' ||
      typeof report.buildNumber !== 'string' ||
      typeof report.buildSha !== 'string' ||
      typeof report.bundleIdentifier !== 'string' ||
      typeof report.platform !== 'string' ||
      typeof report.platformVersion !== 'string' ||
      typeof report.name !== 'string' ||
      typeof report.message !== 'string' ||
      typeof report.stack !== 'string'
    ) {
      return null;
    }

    return report as LaunchCrashReport;
  } catch {
    return null;
  }
}

export function parseNativeTurboModuleReport(value: string | null): NativeTurboModuleReport | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const report = parsed as Partial<NativeTurboModuleReport>;
    if (
      report.schemaVersion !== REPORT_SCHEMA_VERSION ||
      report.kind !== 'native-turbo-module' ||
      typeof report.capturedAt !== 'string' ||
      typeof report.appVersion !== 'string' ||
      typeof report.buildNumber !== 'string' ||
      typeof report.buildSha !== 'string' ||
      typeof report.bundleIdentifier !== 'string' ||
      typeof report.platformVersion !== 'string' ||
      typeof report.moduleName !== 'string' ||
      typeof report.methodName !== 'string' ||
      typeof report.exceptionName !== 'string' ||
      typeof report.reason !== 'string' ||
      !Array.isArray(report.stackSymbols) ||
      !report.stackSymbols.every((symbol) => typeof symbol === 'string')
    ) {
      return null;
    }

    return report as NativeTurboModuleReport;
  } catch {
    return null;
  }
}

export function parseLaunchDiagnosticReport(
  javascriptValue: string | null,
  nativeValue: string | null
): LaunchDiagnosticReport | null {
  return parseNativeTurboModuleReport(nativeValue) ?? parseLaunchCrashReport(javascriptValue);
}

export function isNativeTurboModuleReport(
  report: LaunchDiagnosticReport
): report is NativeTurboModuleReport {
  return 'kind' in report && report.kind === 'native-turbo-module';
}

export function formatLaunchCrashReport(report: LaunchCrashReport): string {
  return [
    'Tulona fatal JavaScript launch diagnostic',
    `Captured: ${report.capturedAt}`,
    `App: ${report.appVersion} (${report.buildNumber})`,
    `Build commit: ${report.buildSha}`,
    `Bundle ID: ${report.bundleIdentifier}`,
    `Platform: ${report.platform} ${report.platformVersion}`,
    `Error: ${report.name}: ${report.message}`,
    '',
    'JavaScript stack:',
    report.stack || '(no JavaScript stack was provided)',
  ].join('\n');
}

export function formatLaunchDiagnosticReport(report: LaunchDiagnosticReport): string {
  if (!isNativeTurboModuleReport(report)) {
    return formatLaunchCrashReport(report);
  }

  return [
    'Tulona native TurboModule launch diagnostic',
    `Captured: ${report.capturedAt}`,
    `App: ${report.appVersion} (${report.buildNumber})`,
    `Build commit: ${report.buildSha}`,
    `Bundle ID: ${report.bundleIdentifier}`,
    `iOS: ${report.platformVersion}`,
    `TurboModule: ${report.moduleName}.${report.methodName}`,
    `Exception: ${report.exceptionName}: ${report.reason}`,
    '',
    'Native stack symbols:',
    report.stackSymbols.join('\n') || '(no native stack was provided)',
  ].join('\n');
}

export function installLaunchCrashReporter(options: {
  errorUtils: ErrorUtilsLike | undefined;
  storage: CrashReportStorage;
  metadata: CrashReportMetadata;
}): boolean {
  const { errorUtils, storage, metadata } = options;
  const previousHandler = errorUtils?.getGlobalHandler?.();

  // Without a prior React Native handler there is nothing safe to delegate to.
  if (!errorUtils || !previousHandler) return false;

  errorUtils.setGlobalHandler((error, isFatal) => {
    if (!isFatal) {
      previousHandler(error, isFatal);
      return;
    }

    const report = createLaunchCrashReport(error, metadata);
    let delegated = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const delegate = () => {
      if (delegated) return;
      delegated = true;
      if (timeout !== undefined) clearTimeout(timeout);
      previousHandler(error, isFatal);
    };

    // Give AsyncStorage a brief chance to flush before React Native's fatal
    // handler aborts the process. Always delegate, even if storage is offline.
    timeout = setTimeout(delegate, PERSIST_TIMEOUT_MS);
    try {
      void Promise.resolve(storage.setItem(LAUNCH_CRASH_REPORT_KEY, JSON.stringify(report))).then(
        delegate,
        delegate
      );
    } catch {
      delegate();
    }
  });

  return true;
}
