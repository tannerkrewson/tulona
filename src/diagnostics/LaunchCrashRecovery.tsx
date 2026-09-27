import { useState } from 'react';
import { SafeAreaView, ScrollView, Share, StyleSheet, Text, Pressable, View } from 'react-native';

import {
  formatLaunchDiagnosticReport,
  isNativeTurboModuleReport,
  type LaunchDiagnosticReport,
} from './launchCrashReporter';

export default function LaunchCrashRecovery({
  report,
  onContinue,
}: {
  report: LaunchDiagnosticReport;
  onContinue: () => void;
}) {
  const [shareError, setShareError] = useState<string | null>(null);

  const shareReport = async () => {
    setShareError(null);
    try {
      await Share.share({
        title: 'Tulona launch diagnostic',
        message: formatLaunchDiagnosticReport(report),
      });
    } catch (error) {
      setShareError(error instanceof Error ? error.message : String(error));
    }
  };

  const isNativeReport = isNativeTurboModuleReport(report);
  const reportName = isNativeReport ? report.exceptionName : report.name;
  const reportMessage = isNativeReport
    ? `${report.moduleName}.${report.methodName}: ${report.reason}`
    : report.message;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.icon}>
          <Text style={styles.iconText}>!</Text>
        </View>
        <Text style={styles.eyebrow}>STARTUP DIAGNOSTIC</Text>
        <Text style={styles.title}>
          {isNativeReport
            ? 'A native module exception was intercepted'
            : 'A previous launch stopped unexpectedly'}
        </Text>
        <Text style={styles.description}>
          {isNativeReport
            ? 'Tulona recorded the native module, method, exception, and stack, then held back its normal screens so you can share the report.'
            : 'Tulona saved the fatal JavaScript error and held back its normal screens so you can share the report before trying again.'}
        </Text>

        <View style={styles.reportCard}>
          <Text style={styles.errorName}>{reportName}</Text>
          <Text selectable style={styles.errorMessage}>
            {reportMessage}
          </Text>
          <Text style={styles.metadata}>
            Tulona {report.appVersion} ({report.buildNumber}) ·{' '}
            {isNativeReport ? 'iOS' : report.platform} {report.platformVersion}
          </Text>
          <Text selectable style={styles.buildSha}>
            Build {report.buildSha}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => void shareReport()}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>Share diagnostic report</Text>
        </Pressable>
        {shareError ? <Text style={styles.shareError}>{shareError}</Text> : null}

        <Pressable
          accessibilityRole="button"
          onPress={onContinue}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryButtonText}>Try opening Tulona anyway</Text>
        </Pressable>
        <Text style={styles.privacyNote}>
          The report stays on this device unless you choose to share it. It contains the exception
          details and stack, so review it before sharing. Your habit database is not attached.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#0f0e13',
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  icon: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#322a25',
    borderRadius: 18,
    height: 48,
    justifyContent: 'center',
    marginBottom: 28,
    width: 48,
  },
  iconText: {
    color: '#ffc590',
    fontSize: 26,
    fontWeight: '700',
  },
  eyebrow: {
    color: '#c5a488',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  title: {
    color: '#f7f3fa',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 36,
    marginBottom: 12,
  },
  description: {
    color: '#bdb7c4',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  reportCard: {
    backgroundColor: '#1b1920',
    borderColor: '#393540',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
    padding: 16,
  },
  errorName: {
    color: '#f7f3fa',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  errorMessage: {
    color: '#f0b489',
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 14,
  },
  metadata: {
    color: '#aaa4b0',
    fontSize: 12,
  },
  buildSha: {
    color: '#817b88',
    fontFamily: 'monospace',
    fontSize: 11,
    marginTop: 5,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#d8b99d',
    borderRadius: 14,
    minHeight: 54,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#1c1714',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#514c58',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: '#ece7f1',
    fontSize: 15,
    fontWeight: '600',
  },
  shareError: {
    color: '#ffb4ab',
    fontSize: 13,
    marginTop: 8,
  },
  privacyNote: {
    color: '#918b97',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 20,
  },
  pressed: {
    opacity: 0.78,
  },
});
