import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { Suspense, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import LaunchCrashRecovery from '../src/diagnostics/LaunchCrashRecovery';
import {
  NATIVE_TURBOMODULE_REPORT_FILENAME,
  parseLaunchDiagnosticReport,
  LAUNCH_CRASH_REPORT_KEY,
  type LaunchDiagnosticReport,
} from '../src/diagnostics/launchCrashReporter';

const NormalAppLayout = React.lazy(() => import('../src/diagnostics/NormalAppLayout'));

export default function RootLayout() {
  const [report, setReport] = useState<LaunchDiagnosticReport | null | undefined>(() =>
    Platform.OS === 'web' ? null : undefined
  );

  useEffect(() => {
    let isMounted = true;

    if (Platform.OS === 'web') return;

    const readJavaScriptReport = async () => {
      try {
        return await AsyncStorage.getItem(LAUNCH_CRASH_REPORT_KEY);
      } catch {
        return null;
      }
    };

    const readNativeReport = async () => {
      try {
        const { File, Paths } = await import('expo-file-system');
        const file = new File(Paths.document, NATIVE_TURBOMODULE_REPORT_FILENAME);
        return file.exists ? await file.text() : null;
      } catch {
        return null;
      }
    };

    Promise.all([readJavaScriptReport(), readNativeReport()]).then(
      ([javascriptReport, nativeReport]) => {
        if (isMounted) setReport(parseLaunchDiagnosticReport(javascriptReport, nativeReport));
      }
    );

    return () => {
      isMounted = false;
    };
  }, []);

  if (report === undefined) return <View style={styles.loading} />;

  if (report) {
    return (
      <LaunchCrashRecovery
        report={report}
        onContinue={() => {
          void AsyncStorage.removeItem(LAUNCH_CRASH_REPORT_KEY).catch(() => {});
          void import('expo-file-system')
            .then(({ File, Paths }) => {
              const file = new File(Paths.document, NATIVE_TURBOMODULE_REPORT_FILENAME);
              if (file.exists) file.delete();
            })
            .catch(() => {});
          setReport(null);
        }}
      />
    );
  }

  return (
    <Suspense fallback={<View style={styles.loading} />}>
      <NormalAppLayout />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  loading: {
    backgroundColor: '#0f0e13',
    flex: 1,
  },
});
