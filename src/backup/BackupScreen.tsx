import { Column, Text } from '@ui/primitives';
import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { useAppTheme } from '@theme';
import {
  confirmAction,
  errorText,
  Form,
  FormContent,
  FormRow,
  FormSection,
  FormSwitchRow,
  Screen,
} from '@ui';
import { bootCoordinator } from '../orchestration';
import { goBackInAppStack } from '../navigation/app-back';

import { BackupImportError, type BackupImportResult } from './backup-import';
import { exportBackupJson, exportIntervalsCsv } from './export-file';
import { loadBackupRuntime, type BackupRuntime } from './backup-runtime';
import {
  TimematorImportError,
  type TimematorCsvPreview,
  type TimematorImportResult,
} from './timemator-import';
import { RecoveryActions } from '../orchestration/RecoveryActions';
import type {
  DropboxBackupService,
  DropboxBackupStatus,
  DropboxSetupChoice,
} from './dropbox-backup';

function BackupFileSection({
  result,
  busy,
  onRestore,
}: {
  result: BackupImportResult;
  busy: boolean;
  onRestore: () => void;
}) {
  const { summary } = result;
  return (
    <FormSection
      footer="Restoring replaces everything on this device with this backup."
      testID="backup-import-summary"
      title="Selected Backup"
    >
      <FormRow label="Activities" value={`${summary.activities}`} />
      <FormRow label="Folders" value={`${summary.folders}`} />
      <FormRow label="Routines" value={`${summary.routines}`} />
      <FormRow label="Tracker entries" value={summary.transitions.toLocaleString()} />
      <FormRow label="Habits" value={`${summary.habits}`} />
      <FormRow label="Goals" value={`${summary.goals}`} />
      <FormRow
        disabled={busy}
        kind="destructive"
        label="Restore This Backup"
        onPress={onRestore}
        testID="replace-current-data"
      />
    </FormSection>
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
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 15, fontWeight: '700' }}>
        That didn’t work
      </Text>
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

function TimematorFileSection({
  preview,
  busy,
  onImport,
}: {
  preview: TimematorCsvPreview;
  busy: boolean;
  onImport: () => void;
}) {
  return (
    <FormSection
      footer={`${formatPreviewTimestamp(preview.firstTimestamp)} – ${formatPreviewTimestamp(preview.lastTimestamp)}`}
      testID="timemator-import-preview"
      title="Timemator File"
    >
      <FormRow label="Entries" value={preview.rowCount.toLocaleString()} />
      <FormRow label="Activities" value={`${preview.activityCount}`} />
      <FormRow label="Folders" value={`${preview.folderCount}`} />
      {preview.runningRowCount ? (
        <FormRow label="Running" value={`${preview.runningRowCount}`} />
      ) : null}
      <FormRow
        disabled={busy}
        kind="action"
        label="Add to Tracker"
        onPress={onImport}
        testID="review-timemator-import"
      />
    </FormSection>
  );
}

function TimematorImportSummary({ result }: { result: TimematorImportResult }) {
  const { summary } = result;
  return (
    <FormSection testID="timemator-import-summary" title="Imported from Timemator">
      <FormRow
        label="Entries added"
        subtitle={
          summary.skippedTransitions
            ? `${summary.skippedTransitions} were already in your tracker`
            : undefined
        }
        value={`${summary.insertedTransitions}`}
      />
      <FormRow
        label="New activities"
        subtitle={
          summary.matchedActivities
            ? `${summary.matchedActivities} matched existing activities`
            : undefined
        }
        value={`${summary.createdActivities}`}
      />
      <FormRow
        label="New folders"
        subtitle={
          summary.matchedFolders ? `${summary.matchedFolders} matched existing folders` : undefined
        }
        value={`${summary.createdFolders}`}
      />
    </FormSection>
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

function formatDropboxTimestamp(value: string | null): string {
  if (!value) return 'Never';
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp);
}

function syncSummary(summary: BackupImportResult['summary']): string {
  return `${summary.activities} activities, ${summary.habits} habits, ${summary.goals} goals, ${summary.transitions.toLocaleString()} tracker entries`;
}

function DropboxBackupPanel({ service }: { service: DropboxBackupService }) {
  const { colors } = useAppTheme();
  const [status, setStatus] = useState<DropboxBackupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void service
      .getStatus()
      .then((nextStatus) => setStatus(nextStatus))
      .catch((actionError: unknown) => setError(errorText(actionError)));
  }, [service]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => service.subscribeStatus(setStatus), [service]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      refresh();
    } catch (actionError) {
      const nextStatus = await service.getStatus().catch(() => null);
      if (!nextStatus?.setupReview) setError(errorText(actionError));
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const connected = status?.connected ?? false;
  const dropboxAvailable = Boolean(status?.appKeyConfigured);
  const authorize = () =>
    void run(async () => {
      const { url } = await service.beginAuthorization();
      await Linking.openURL(url);
    });
  const review = status?.setupReview ?? null;
  const chooseSetup = (choice: DropboxSetupChoice) => {
    if (!review) return;
    void confirmAction({
      confirmLabel: choice === 'merge' ? 'Combine' : 'Replace',
      destructive: choice !== 'merge',
      message:
        choice === 'cloud'
          ? 'Everything on this device, including settings and running timers, will be replaced with your Dropbox data. A copy of this device’s data is saved first.'
          : choice === 'local'
            ? 'Dropbox will be replaced with this device’s data. A copy of the Dropbox data is saved first. Your other devices may ask which data to use.'
            : 'Records from both are kept. When the same record exists in both, the Dropbox version wins. Copies of both are saved first.',
      title:
        choice === 'cloud'
          ? 'Replace This Device’s Data?'
          : choice === 'local'
            ? 'Replace Dropbox Data?'
            : 'Combine Both?',
    }).then((confirmed) => {
      if (confirmed) void run(() => service.resolveSetup(review.token, choice));
    });
  };
  const syncFooter = error
    ? error
    : status?.lastError && !review
      ? `Sync needs attention: ${status.lastError}`
      : status?.syncPhase === 'offline'
        ? 'Dropbox can’t be reached. Changes are saved here and will sync when you’re back online.'
        : 'Disconnecting stops syncing. Your data stays on this device and in Dropbox.';

  if (!status) {
    return <FormSection testID="dropbox-backup-actions" title="Dropbox" />;
  }

  if (!dropboxAvailable && !connected) {
    return (
      <FormSection
        footer="Dropbox sync isn’t available in this version of Tulona. Export a backup below to keep a copy."
        footerTestID="dropbox-sync-unsupported"
        testID="dropbox-backup-actions"
        title="Dropbox"
      >
        <FormRow label="Sync" muted value="Unavailable" />
      </FormSection>
    );
  }

  if (!connected) {
    return (
      <FormSection
        footer={error ?? 'Keep your data in sync across devices. Everything still works offline.'}
        footerTone={error ? 'danger' : 'muted'}
        testID="dropbox-backup-actions"
        title="Dropbox"
      >
        <FormRow
          disabled={busy}
          kind="action"
          label="Connect Dropbox"
          onPress={authorize}
          testID="dropbox-connect"
        />
        {status.recoveryAvailable ? (
          <FormRow
            disabled={busy}
            kind="action"
            label="Export Data From Before Sync"
            onPress={() =>
              void run(async () => {
                await exportBackupJson(await service.exportRecoveryJson());
              })
            }
            testID="dropbox-export-recovery"
          />
        ) : null}
      </FormSection>
    );
  }

  return (
    <>
      {review ? (
        <FormSection
          footer="Nothing is replaced until you confirm, and a copy of both is saved first."
          testID="dropbox-setup-review"
          title="Choose Data to Sync"
        >
          <FormContent>
            <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
              {review.reason}
            </Text>
          </FormContent>
          {review.cloud ? (
            <FormRow
              disabled={busy}
              kind="action"
              label="Use Dropbox Data"
              onPress={() => chooseSetup('cloud')}
              subtitle={syncSummary(review.cloud)}
              testID="dropbox-use-cloud"
            />
          ) : null}
          <FormRow
            disabled={busy}
            kind="action"
            label="Use This Device’s Data"
            onPress={() => chooseSetup('local')}
            subtitle={syncSummary(review.local)}
            testID="dropbox-use-local"
          />
          {review.cloud ? (
            <FormRow
              disabled={busy}
              kind="action"
              label="Combine Both"
              onPress={() => chooseSetup('merge')}
              subtitle="Keeps records from each. Matching records use the Dropbox version."
              testID="dropbox-merge"
            />
          ) : null}
        </FormSection>
      ) : null}
      <FormSection
        footer={syncFooter}
        footerTestID={error ? 'dropbox-error' : status.lastError ? 'dropbox-last-error' : undefined}
        footerTone={error || (status.lastError && !review) ? 'danger' : 'muted'}
        testID="dropbox-backup-actions"
        title="Dropbox"
      >
        <FormSwitchRow
          disabled={busy || Boolean(review)}
          label="Sync Automatically"
          onValueChange={(value) => void run(() => service.setEnabled(value))}
          testID="dropbox-auto-backup-enabled"
          value={status.enabled}
        />
        <FormRow
          label="Last Synced"
          testID="dropbox-sync-state"
          value={
            status.syncPhase === 'syncing'
              ? 'Syncing…'
              : status.syncPhase === 'offline'
                ? 'Offline'
                : formatDropboxTimestamp(status.lastSyncAt ?? status.lastBackupAt)
          }
        />
        <FormRow
          disabled={busy || Boolean(review)}
          kind="action"
          label="Sync Now"
          onPress={() => void run(() => service.syncNow())}
          testID="dropbox-backup-now"
        />
        <FormRow
          disabled={busy}
          kind="action"
          label="Change Account"
          onPress={authorize}
          testID="dropbox-reconnect"
        />
        {status.recoveryAvailable ? (
          <FormRow
            disabled={busy}
            kind="action"
            label="Export Data From Before Sync"
            onPress={() =>
              void run(async () => {
                await exportBackupJson(await service.exportRecoveryJson());
              })
            }
            testID="dropbox-export-recovery"
          />
        ) : null}
        <FormRow
          disabled={busy}
          kind="destructive"
          label="Disconnect"
          onPress={() => void run(() => service.disconnect())}
          testID="dropbox-disconnect"
        />
      </FormSection>
    </>
  );
}

function BackupContent({
  runtime,
  onBack,
  title,
  footer,
}: {
  runtime: BackupRuntime;
  onBack: () => void;
  title: string;
  footer?: ReactNode;
}) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importText, setImportText] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<BackupImportResult | null>(null);
  const [timematorText, setTimematorText] = useState<string | null>(null);
  const [timematorPreview, setTimematorPreview] = useState<TimematorCsvPreview | null>(null);
  const [timematorResult, setTimematorResult] = useState<TimematorImportResult | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const lastAction = useRef<(() => Promise<void>) | null>(null);

  const exportJson = async () => {
    lastAction.current = exportJson;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const content = await runtime.backupService.exportJson();
      if ((await exportBackupJson(content)) === 'exported') setSuccess('Backup exported.');
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
      if ((await exportIntervalsCsv(content)) === 'exported') {
        setSuccess('CSV exported.');
      }
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
    try {
      const result = await runtime.backupService.replaceCurrentData(importText);
      setSuccess('Backup restored.');
      setRestored(true);
      void result;
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
    try {
      const result = await runtime.timematorImportService.importCsv(timematorText);
      setTimematorResult(result);
      setTimematorText(null);
      setTimematorPreview(null);
      setSuccess('Timemator data added.');
      setRestored(true);
      bootCoordinator.reset();
    } catch (actionError) {
      setError(importErrorMessage(actionError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Screen onBack={onBack} title={title}>
        <Form>
          <DropboxBackupPanel service={runtime.dropboxBackupService} />
          {error ? (
            <ErrorPanel
              message={error}
              onBack={onBack}
              onRetry={() => {
                const action = lastAction.current;
                if (action) void action();
              }}
            />
          ) : null}
          {success ? (
            <FormSection testID="backup-success">
              <FormRow
                icon="check-circle-2"
                iconColor={colors.success.foreground}
                label={success}
              />
              {restored ? (
                <FormRow
                  kind="action"
                  label="Open Tracker"
                  onPress={() => router.replace('/')}
                  testID={
                    success.startsWith('Timemator')
                      ? 'reload-after-timemator-import'
                      : 'reload-after-restore'
                  }
                />
              ) : null}
            </FormSection>
          ) : null}
          <FormSection
            footer={
              busy
                ? 'Working…'
                : 'A backup file has everything and can be restored later. CSV lists your tracked time for spreadsheets.'
            }
            footerTestID={busy ? 'backup-progress' : undefined}
            testID="backup-actions"
            title="Backup"
          >
            <FormRow
              disabled={busy}
              kind="action"
              label="Export Backup"
              onPress={() => void exportJson()}
              testID="export-json"
            />
            <FormRow
              disabled={busy}
              kind="action"
              label="Export Tracked Time as CSV"
              onPress={() => void exportCsv()}
              testID="export-csv"
            />
            <FormRow
              disabled={busy}
              kind="action"
              label="Restore From Backup…"
              onPress={() => void importFile()}
              testID="import-json"
            />
          </FormSection>
          {importResult && importText ? (
            <BackupFileSection
              busy={busy}
              onRestore={() =>
                void confirmAction({
                  confirmLabel: 'Restore',
                  destructive: true,
                  message:
                    'Everything on this device will be replaced with this backup. Your current data is kept as a separate copy.',
                  title: 'Restore This Backup?',
                }).then((confirmed) => {
                  if (confirmed) void replace();
                })
              }
              result={importResult}
            />
          ) : null}
          <FormSection
            footer="Imports add to your data and never replace it. Timemator activities are matched by name."
            testID="import-actions"
            title="Import"
          >
            <FormRow
              accessibilityLabel="Import TickTick habits"
              disabled={busy}
              label="TickTick Habits"
              onPress={() => router.push('/habit-import' as Href)}
              testID="import-ticktick-habits"
            />
            <FormRow
              accessibilityLabel="Import Timemator tracker data"
              disabled={busy}
              label="Timemator Tracker Data"
              onPress={() => void inspectTimematorFile()}
              testID="import-timemator-csv"
            />
          </FormSection>
          {timematorPreview && timematorText ? (
            <TimematorFileSection
              busy={busy}
              onImport={() =>
                void confirmAction({
                  confirmLabel: 'Add',
                  message:
                    'These entries are added to your tracker. Nothing you already have is changed.',
                  title: 'Add Timemator History?',
                }).then((confirmed) => {
                  if (confirmed) void importTimemator();
                })
              }
              preview={timematorPreview}
            />
          ) : null}
          {timematorResult ? <TimematorImportSummary result={timematorResult} /> : null}
          {footer}
        </Form>
      </Screen>
    </>
  );
}

export default function BackupScreen({
  title = 'Backup',
  onBack,
  footer,
}: {
  title?: string;
  onBack?: () => void;
  footer?: ReactNode;
}) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const backAction = onBack ?? (() => goBackInAppStack(router, '/settings'));
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
      <Screen onBack={backAction} title={title}>
        <Column spacing={16} style={{ width: '100%' }}>
          <Text
            textStyle={{
              color: loadError ? colors.danger.foreground : colors.textMuted,
              fontSize: 15,
            }}
          >
            {loadError ?? 'Loading data tools...'}
          </Text>
          {loadError ? <ErrorPanel message={loadError} onBack={backAction} onRetry={load} /> : null}
          {footer}
        </Column>
      </Screen>
    );
  }
  return <BackupContent footer={footer} onBack={backAction} runtime={runtime} title={title} />;
}
