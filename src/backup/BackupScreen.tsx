import { Column, Row, Text } from '@expo/ui';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';
import { AppButton, ConfirmationModal, errorText, Screen } from '@ui';
import { bootCoordinator } from '../orchestration';

import { BackupImportError, type BackupImportResult } from './backup-import';
import { downloadBackupJson, downloadIntervalsCsv } from './web-download';
import { loadBackupRuntime, type BackupRuntime } from './backup-runtime';
import {
  TimematorImportError,
  type TimematorCsvPreview,
  type TimematorImportResult,
} from './timemator-import';
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
        {`${summary.goals} goals, ${summary.goalWeeklyStatuses} weekly goal statuses`}
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
          Data action failed
        </Text>
      </Row>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{message}</Text>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 13 }}>
        Your current data was not changed.
      </Text>
      <RecoveryActions onClose={onBack} onRetry={onRetry} testID="backup-recovery" />
    </Column>
  );
}

function formatPreviewTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function TimematorPreview({ preview }: { preview: TimematorCsvPreview }) {
  const { colors } = useAppTheme();
  return (
    <Column
      spacing={5}
      style={{
        backgroundColor: colors.active.background,
        borderColor: colors.border,
        borderRadius: 12,
        borderWidth: 1,
        padding: 12,
        width: '100%',
      }}
      testID="timemator-import-preview"
    >
      <Text textStyle={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>
        Timemator export ready
      </Text>
      <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
        {`${preview.rowCount.toLocaleString()} rows · ${preview.activityCount} activities · ${preview.folderCount} folders`}
      </Text>
      <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
        {`${preview.gapCount} idle gaps will be preserved${preview.runningRowCount ? ` · ${preview.runningRowCount} running session` : ''}`}
      </Text>
      <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>
        {`${formatPreviewTimestamp(preview.firstTimestamp)} – ${formatPreviewTimestamp(preview.lastTimestamp)}`}
      </Text>
    </Column>
  );
}

function TimematorImportSummary({ result }: { result: TimematorImportResult }) {
  const { colors } = useAppTheme();
  const { summary } = result;
  return (
    <Column
      spacing={5}
      style={{
        backgroundColor: colors.success.background,
        borderColor: colors.success.foreground,
        borderRadius: 12,
        borderWidth: 1,
        padding: 12,
        width: '100%',
      }}
      testID="timemator-import-summary"
    >
      <Text textStyle={{ color: colors.success.foreground, fontSize: 15, fontWeight: '700' }}>
        Timemator data imported
      </Text>
      <Text textStyle={{ color: colors.success.foreground, fontSize: 14 }}>
        {`${summary.insertedTransitions} tracker transitions added · ${summary.skippedTransitions} already present`}
      </Text>
      <Text textStyle={{ color: colors.success.foreground, fontSize: 14 }}>
        {`${summary.createdActivities} activities created · ${summary.matchedActivities} existing activities matched`}
      </Text>
      <Text textStyle={{ color: colors.success.foreground, fontSize: 14 }}>
        {`${summary.createdFolders} folders created · ${summary.matchedFolders} existing folders matched`}
      </Text>
    </Column>
  );
}

async function readPickerAsset(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  const fileAsset = asset as DocumentPicker.DocumentPickerAsset & {
    file?: { text(): Promise<string> };
  };
  return fileAsset.file ? fileAsset.file.text() : (await fetch(asset.uri)).text();
}

function importErrorMessage(actionError: unknown): string {
  if (actionError instanceof BackupImportError) {
    return `${actionError.message}${actionError.details?.length ? `: ${actionError.details.join('; ')}` : ''}`;
  }
  if (actionError instanceof TimematorImportError) return actionError.message;
  return errorText(actionError);
}

function BackupContent({ runtime }: { runtime: BackupRuntime }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importText, setImportText] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<BackupImportResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [timematorText, setTimematorText] = useState<string | null>(null);
  const [timematorPreview, setTimematorPreview] = useState<TimematorCsvPreview | null>(null);
  const [timematorResult, setTimematorResult] = useState<TimematorImportResult | null>(null);
  const [timematorConfirming, setTimematorConfirming] = useState(false);
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
      const text = await readPickerAsset(result.assets[0]);
      const parsed = runtime.backupService.inspectImport(text);
      setImportText(text);
      setImportResult(parsed);
    } catch (actionError) {
      setError(importErrorMessage(actionError));
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

  const inspectTimematorFile = async () => {
    lastAction.current = inspectTimematorFile;
    setBusy(true);
    setError(null);
    setSuccess(null);
    setTimematorResult(null);
    setTimematorText(null);
    setTimematorPreview(null);
    setTimematorConfirming(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['text/csv', 'text/plain', 'application/octet-stream'],
      });
      if (result.canceled) return;
      const text = await readPickerAsset(result.assets[0]);
      setTimematorText(text);
      setTimematorPreview(runtime.timematorImportService.inspect(text));
    } catch (actionError) {
      setError(importErrorMessage(actionError));
    } finally {
      setBusy(false);
    }
  };

  const importTimemator = async () => {
    lastAction.current = importTimemator;
    if (!timematorText) return;
    setBusy(true);
    setError(null);
    setTimematorConfirming(false);
    try {
      const result = await runtime.timematorImportService.importCsv(timematorText);
      setTimematorResult(result);
      setTimematorText(null);
      setTimematorPreview(null);
      setSuccess('Timemator tracker data was added. Reload the tracker to see it.');
      bootCoordinator.reset();
    } catch (actionError) {
      setError(importErrorMessage(actionError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Screen onBack={() => router.back()} title="Backup">
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
            testID="timemator-import-actions"
          >
            <Text textStyle={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
              Import Timemator tracker data
            </Text>
            <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
              Add Timemator&apos;s semicolon-delimited export to your tracker. Existing activities
              are matched by name; missing activities are created automatically.
            </Text>
            <AppButton
              disabled={busy}
              label="Choose Timemator CSV"
              onPress={() => void inspectTimematorFile()}
              style={{ height: 50, width: '100%' }}
              testID="import-timemator-csv"
            />
            {timematorPreview ? <TimematorPreview preview={timematorPreview} /> : null}
            {timematorPreview && timematorText ? (
              <AppButton
                disabled={busy}
                label="Review and import"
                onPress={() => setTimematorConfirming(true)}
                style={{ height: 52, width: '100%' }}
                testID="review-timemator-import"
              />
            ) : null}
            {timematorResult ? <TimematorImportSummary result={timematorResult} /> : null}
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
                <Text textStyle={{ color: colors.success.foreground, fontSize: 15 }}>
                  {success}
                </Text>
              </Row>
            </Column>
          ) : null}
          {importResult ? <Summary result={importResult} /> : null}
          {importResult && importText ? (
            <AppButton
              disabled={busy}
              label="Replace current data"
              onPress={() => setConfirming(true)}
              style={{ height: 52, width: '100%' }}
              testID="replace-current-data"
            />
          ) : null}
          {success?.startsWith('Data replaced') ? (
            <AppButton
              label="Reload active dataset"
              onPress={() => router.replace('/(tabs)')}
              testID="reload-after-restore"
            />
          ) : null}
          {success?.startsWith('Timemator tracker data') ? (
            <AppButton
              label="Reload tracker"
              onPress={() => router.replace('/(tabs)')}
              testID="reload-after-timemator-import"
            />
          ) : null}
        </Column>
      </Screen>
      <ConfirmationModal
        busy={busy}
        cancelLabel="Cancel"
        cancelTestID="cancel-timemator-import"
        confirmLabel="Yes, import tracker data"
        confirmTestID="confirm-timemator-import"
        message="This adds the imported sessions to the current dataset and keeps your existing tracker data."
        onCancel={() => setTimematorConfirming(false)}
        onConfirm={() => void importTimemator()}
        testID="timemator-import-confirmation"
        title="Add this tracker history?"
        visible={timematorConfirming && timematorPreview !== null && timematorText !== null}
      />
      <ConfirmationModal
        busy={busy}
        cancelLabel="Cancel"
        cancelTestID="cancel-replace"
        confirmLabel="Yes, replace current data"
        confirmTestID="confirm-replace"
        message="This switches this device to the selected backup after it is verified. Your current dataset will be retained, but this action changes which data is active."
        onCancel={() => setConfirming(false)}
        onConfirm={() => void replace()}
        testID="backup-replace-confirmation"
        title="Replace all current data?"
        visible={confirming && importResult !== null && importText !== null}
      />
    </>
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
      <Screen onBack={() => router.back()} title="Backup">
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
