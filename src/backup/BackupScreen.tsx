import { Column, Row, Text } from '@expo/ui';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';
import { AppButton, errorText, Screen } from '@ui';
import { bootCoordinator } from '../orchestration';

import { BackupImportError, type BackupImportResult } from './backup-import';
import { downloadBackupJson, downloadIntervalsCsv } from './web-download';
import { loadBackupRuntime, type BackupRuntime } from './backup-runtime';
import { RecoveryActions } from '../orchestration/RecoveryActions';

function Summary({ result }: { result: BackupImportResult }) {
  const { colors } = useAppTheme();
  const { summary } = result;
  return (
    <Column
      spacing={6}
      style={{
        backgroundColor: colors.success.background,
        borderColor: colors.success.foreground,
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
        width: '100%',
      }}
      testID="backup-import-summary"
    >
      <Row alignment="center" spacing={8}>
        <AppIcon
          accessibilityLabel="Backup ready"
          color={colors.success.foreground}
          name="check-circle-2"
          size={20}
        />
        <Text textStyle={{ color: colors.success.foreground, fontSize: 15, fontWeight: '700' }}>
          Valid backup
        </Text>
      </Row>
      <Text textStyle={{ color: colors.success.foreground, fontSize: 15, fontWeight: '700' }}>
        Backup is valid and ready to restore
      </Text>
      <Text textStyle={{ color: colors.success.foreground, fontSize: 14 }}>
        {`${summary.activities} activities, ${summary.routines} routines, ${summary.folders} folders`}
      </Text>
      <Text textStyle={{ color: colors.success.foreground, fontSize: 14 }}>
        {`${summary.transitions} transitions, ${summary.routineRuns} routine runs, ${summary.habits} habits, ${summary.habitDayStates} habit day states`}
      </Text>
      <Text textStyle={{ color: colors.success.foreground, fontSize: 14 }}>
        {`${summary.archivedRecords} archived records retained`}
      </Text>
    </Column>
  );
}

function ErrorPanel({
  message,
  onRetry,
  onBack,
}: {
  message: string | null;
  onRetry?: () => void;
  onBack?: () => void;
}) {
  const { colors } = useAppTheme();
  if (!message) return null;
  return (
    <Column
      spacing={6}
      style={{
        backgroundColor: colors.danger.background,
        borderColor: colors.danger.foreground,
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
        width: '100%',
      }}
      testID="backup-error"
    >
      <Row alignment="center" spacing={8}>
        <AppIcon
          accessibilityLabel="Backup error"
          color={colors.danger.foreground}
          name="circle"
          size={18}
        />
        <Text textStyle={{ color: colors.danger.foreground, fontSize: 15, fontWeight: '700' }}>
          Backup action failed
        </Text>
      </Row>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{message}</Text>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 13 }}>
        Your current data was not replaced.
      </Text>
      <RecoveryActions onBack={onBack} onRetry={onRetry} testID="backup-recovery" />
    </Column>
  );
}

function BackupContent({ runtime }: { runtime: BackupRuntime }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importText, setImportText] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<BackupImportResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const lastAction = useRef<(() => Promise<void>) | null>(null);

  const exportJson = async () => {
    lastAction.current = exportJson;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const content = await runtime.backupService.exportJson();
      if (!downloadBackupJson(content)) throw new Error('JSON download is only available on web');
      setSuccess('JSON backup downloaded.');
    } catch (actionError) {
      setError(errorText(actionError));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    lastAction.current = exportCsv;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const content = await runtime.backupService.exportCsv();
      if (!downloadIntervalsCsv(content)) throw new Error('CSV download is only available on web');
      setSuccess('CSV interval export downloaded.');
    } catch (actionError) {
      setError(errorText(actionError));
    } finally {
      setBusy(false);
    }
  };

  const importFile = async () => {
    lastAction.current = importFile;
    setBusy(true);
    setError(null);
    setSuccess(null);
    setImportResult(null);
    setImportText(null);
    setConfirming(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: 'application/json',
      });
      if (result.canceled) return;
      const asset = result.assets[0] as DocumentPicker.DocumentPickerAsset & {
        file?: { text(): Promise<string> };
      };
      const text = asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text();
      const parsed = runtime.backupService.inspectImport(text);
      setImportText(text);
      setImportResult(parsed);
    } catch (actionError) {
      setError(
        actionError instanceof BackupImportError
          ? `${actionError.message}${actionError.details?.length ? `: ${actionError.details.join('; ')}` : ''}`
          : errorText(actionError)
      );
    } finally {
      setBusy(false);
    }
  };

  const replace = async () => {
    lastAction.current = replace;
    if (!importText) return;
    setBusy(true);
    setError(null);
    setConfirming(false);
    try {
      const result = await runtime.backupService.replaceCurrentData(importText);
      setSuccess(`Data replaced safely in dataset ${result.datasetId}.`);
      setImportText(null);
      setImportResult(null);
      bootCoordinator.reset();
    } catch (actionError) {
      setError(errorText(actionError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      onBack={() => router.back()}
      title="Backup"
      description="Export a copy or validate a backup before replacing this device's data."
    >
      <Column spacing={14} style={{ width: '100%' }}>
        <Column
          spacing={10}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 16,
            borderWidth: 1,
            padding: 16,
            width: '100%',
          }}
          testID="backup-actions"
        >
          <Text textStyle={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
            On-device backup
          </Text>
          <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
            JSON restores the complete dataset. CSV is a read-only analysis export of derived
            intervals.
          </Text>
          <Column spacing={8} style={{ width: '100%' }}>
            <AppButton
              disabled={busy}
              label="Export JSON"
              onPress={() => void exportJson()}
              style={{ height: 50, width: '100%' }}
              testID="export-json"
            />
            <AppButton
              disabled={busy}
              label="Export CSV"
              onPress={() => void exportCsv()}
              style={{ height: 50, width: '100%' }}
              testID="export-csv"
            />
          </Column>
          <AppButton
            disabled={busy}
            label="Choose JSON backup"
            onPress={() => void importFile()}
            style={{ height: 50, width: '100%' }}
            testID="import-json"
          />
        </Column>
        {busy ? (
          <Text textStyle={{ color: colors.textMuted, fontSize: 14 }} testID="backup-progress">
            Working...
          </Text>
        ) : null}
        <ErrorPanel
          message={error}
          onBack={() => router.replace('/(tabs)')}
          onRetry={() => {
            const action = lastAction.current;
            if (action) void action();
          }}
        />
        {success ? (
          <Column
            spacing={6}
            style={{
              backgroundColor: colors.success.background,
              borderColor: colors.success.foreground,
              borderRadius: 14,
              borderWidth: 1,
              padding: 14,
              width: '100%',
            }}
            testID="backup-success"
          >
            <Row alignment="center" spacing={8}>
              <AppIcon
                accessibilityLabel="Backup completed"
                color={colors.success.foreground}
                name="check-circle-2"
                size={18}
              />
              <Text textStyle={{ color: colors.success.foreground, fontSize: 15 }}>{success}</Text>
            </Row>
          </Column>
        ) : null}
        {importResult ? <Summary result={importResult} /> : null}
        {importResult && importText ? (
          confirming ? (
            <Column
              spacing={10}
              style={{
                backgroundColor: colors.warning.background,
                borderColor: colors.warning.foreground,
                borderRadius: 14,
                borderWidth: 1,
                padding: 14,
                width: '100%',
              }}
              testID="backup-replace-confirmation"
            >
              <Text
                textStyle={{ color: colors.warning.foreground, fontSize: 15, fontWeight: '700' }}
              >
                Replace all current data?
              </Text>
              <Text textStyle={{ color: colors.warning.foreground, fontSize: 14 }}>
                This switches this device to the selected backup after it is verified. Your current
                dataset will be retained, but this action changes which data is active.
              </Text>
              <Column spacing={8} style={{ width: '100%' }}>
                <AppButton
                  disabled={busy}
                  label="Yes, replace current data"
                  onPress={() => void replace()}
                  style={{ height: 50, width: '100%' }}
                  testID="confirm-replace"
                />
                <AppButton
                  label="Cancel"
                  onPress={() => setConfirming(false)}
                  style={{ height: 48, width: '100%' }}
                  testID="cancel-replace"
                />
              </Column>
            </Column>
          ) : (
            <AppButton
              disabled={busy}
              label="Replace current data"
              onPress={() => setConfirming(true)}
              style={{ height: 52, width: '100%' }}
              testID="replace-current-data"
            />
          )
        ) : null}
        {success?.startsWith('Data replaced') ? (
          <AppButton
            label="Reload active dataset"
            onPress={() => router.replace('/(tabs)')}
            testID="reload-after-restore"
          />
        ) : null}
      </Column>
    </Screen>
  );
}

export default function BackupScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [runtime, setRuntime] = useState<BackupRuntime | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoadError(null);
    void loadBackupRuntime()
      .then((nextRuntime) => {
        if (!cancelled) setRuntime(nextRuntime);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void Promise.resolve().then(() => {
      if (!disposed) cleanup = load();
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [load]);

  if (!runtime) {
    return (
      <Screen
        onBack={() => router.back()}
        title="Backup"
        description="Export a copy or validate a backup before replacing this device's data."
      >
        <Text
          textStyle={{
            color: loadError ? colors.danger.foreground : colors.textMuted,
            fontSize: 15,
          }}
        >
          {loadError ?? 'Loading backup tools...'}
        </Text>
        {loadError ? (
          <ErrorPanel message={loadError} onBack={() => router.replace('/(tabs)')} onRetry={load} />
        ) : null}
      </Screen>
    );
  }
  return <BackupContent runtime={runtime} />;
}
