import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { Suspense, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import LaunchCrashRecovery from '../src/diagnostics/LaunchCrashRecovery';
import {
  LAUNCH_CRASH_REPORT_KEY,
  parseLaunchCrashReport,
  type LaunchCrashReport,
} from '../src/diagnostics/launchCrashReporter';

const NormalAppLayout = React.lazy(() => import('../src/diagnostics/NormalAppLayout'));

export default function RootLayout() {
  const [report, setReport] = useState<LaunchCrashReport | null | undefined>(() =>
    Platform.OS === 'web' ? null : undefined
  );

  useEffect(() => {
    let isMounted = true;

    if (Platform.OS === 'web') return;

    AsyncStorage.getItem(LAUNCH_CRASH_REPORT_KEY)
      .then((storedReport) => {
        if (isMounted) setReport(parseLaunchCrashReport(storedReport));
      })
      .catch(() => {
        if (isMounted) setReport(null);
      });

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
