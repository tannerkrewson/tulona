import { Column, Picker, Row, Switch, Text } from '@expo/ui';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';
import { AccessiblePicker, AppButton, errorText, Screen } from '@ui';

import { bootCoordinator } from '../orchestration';
import { formatHabitSchedule } from './habit-format';
import {
  buildTickTickImportInputs,
  DEFAULT_TICKTICK_IMPORT_OPTIONS,
  parseTickTickWorkbook,
  TickTickImportError,
  type TickTickDuplicatePolicy,
  type TickTickHabitPreview,
  type TickTickImportOptions,
  type TickTickWorkbookPreview,
} from './ticktick-import';
import { loadHabitRuntime, type HabitRuntime } from './habit-runtime';
import type { HabitImportResult } from './habit-service';

type PickerAssetWithFile = DocumentPicker.DocumentPickerAsset & {
  file?: { arrayBuffer(): Promise<ArrayBuffer> };
};

function importErrorMessage(error: unknown): string {
  if (error instanceof TickTickImportError) {
    return `${error.message}${error.details.length > 0 ? ` ${error.details.join(' ')}` : ''}`;
  }
  return errorText(error);
}

async function readPickerBytes(asset: DocumentPicker.DocumentPickerAsset): Promise<Uint8Array> {
  const file = (asset as PickerAssetWithFile).file;
  if (file) return new Uint8Array(await file.arrayBuffer());
  return new Uint8Array(await (await fetch(asset.uri)).arrayBuffer());
}

function formatHistoryRange(habit: TickTickHabitPreview): string {
  if (!habit.historyStart || !habit.historyEnd) return 'No dated check-ins';
  if (habit.historyStart === habit.historyEnd) return habit.historyStart;
  return `${habit.historyStart} – ${habit.historyEnd}`;
}

function statusLabel(habit: TickTickHabitPreview): string {
  return habit.status === 'archived' ? 'Archived' : 'Active';
}

function HabitChoice({
  habit,
  selected,
  onToggle,
}: {
  habit: TickTickHabitPreview;
  selected: boolean;
  onToggle: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={`${habit.name}, ${statusLabel(habit)}, ${formatHabitSchedule(habit.schedule)}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onToggle}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
        borderBottomColor: colors.border,
        borderBottomWidth: 1,
        flexDirection: 'row',
        gap: 12,
        minHeight: 78,
        paddingHorizontal: 14,
        paddingVertical: 12,
        width: '100%',
      })}
      testID={`ticktick-habit-${habit.key}`}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: selected ? colors.primary : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          borderRadius: 7,
          borderWidth: 2,
          height: 24,
          justifyContent: 'center',
          width: 24,
        }}
      >
        {selected ? (
          <AppIcon color={colors.onPrimary} name="check" size={16} strokeWidth={3} />
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} textStyle={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
          {habit.name}
        </Text>
        <Text
          numberOfLines={2}
          textStyle={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}
        >
          {`${statusLabel(habit)} · ${formatHabitSchedule(habit.schedule)} · ${habit.checkIns.length.toLocaleString()} check-ins`}
        </Text>
        {[
          habit.goal ? `Goal: ${habit.goal}` : null,
          habit.section ? `Section: ${habit.section}` : null,
          habit.reminder ? `Reminder: ${habit.reminder}` : null,
        ].filter((value): value is string => value !== null).length > 0 ? (
          <Text
            numberOfLines={2}
            textStyle={{ color: colors.textMuted, fontSize: 12, lineHeight: 16 }}
          >
            {[
              habit.goal ? `Goal: ${habit.goal}` : null,
              habit.section ? `Section: ${habit.section}` : null,
              habit.reminder ? `Reminder: ${habit.reminder}` : null,
            ]
              .filter((value): value is string => value !== null)
              .join(' · ')}
          </Text>
        ) : null}
        <Text numberOfLines={1} textStyle={{ color: colors.textMuted, fontSize: 12 }}>
          {formatHistoryRange(habit)}
        </Text>
      </View>
    </Pressable>
  );
}

function Panel({ children, testID }: { children: ReactNode; testID?: string }) {
  const { colors } = useAppTheme();
  return (
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
      testID={testID}
    >
      {children}
    </Column>
  );
}

function MessagePanel({
  children,
  tone = 'warning',
  testID,
}: {
  children: ReactNode;
  tone?: 'warning' | 'danger' | 'success';
  testID?: string;
}) {
  const { colors } = useAppTheme();
  const toneColors = colors[tone];
  return (
    <Column
      spacing={6}
      style={{
        backgroundColor: toneColors.background,
        borderColor: toneColors.foreground,
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
        width: '100%',
      }}
      testID={testID}
    >
      {children}
    </Column>
  );
}

function SelectedWarnings({
  preview,
  selectedKeys,
}: {
  preview: TickTickWorkbookPreview;
  selectedKeys: ReadonlySet<string>;
}) {
  const { colors } = useAppTheme();
  const warnings = preview.habits.flatMap((habit) =>
    selectedKeys.has(habit.key) ? habit.warnings.map((warning) => `${habit.name}: ${warning}`) : []
  );
  if (warnings.length === 0 && preview.warnings.length === 0) return null;
  return (
    <MessagePanel testID="ticktick-import-warnings">
      <Text textStyle={{ color: colors.warning.foreground, fontSize: 15, fontWeight: '700' }}>
        Review before importing
      </Text>
      {preview.warnings.map((warning, index) => (
        <Text
          key={`workbook-${warning}-${index}`}
          textStyle={{ color: colors.warning.foreground, fontSize: 13 }}
        >
          {`• ${warning}`}
        </Text>
      ))}
      {warnings.map((warning, index) => (
        <Text
          key={`${warning}-${index}`}
          textStyle={{ color: colors.warning.foreground, fontSize: 13 }}
        >
          {`• ${warning}`}
        </Text>
      ))}
    </MessagePanel>
  );
}

function ImportResultPanel({ result }: { result: HabitImportResult }) {
  const { colors } = useAppTheme();
  return (
    <MessagePanel tone="success" testID="ticktick-import-result">
      <Row alignment="center" spacing={8}>
        <AppIcon color={colors.success.foreground} name="check-circle-2" size={20} />
        <Text textStyle={{ color: colors.success.foreground, fontSize: 16, fontWeight: '700' }}>
          TickTick habits imported
        </Text>
      </Row>
      <Text textStyle={{ color: colors.success.foreground, fontSize: 14 }}>
        {`${result.imported.length} habit${result.imported.length === 1 ? '' : 's'} added · ${result.importedStateCount.toLocaleString()} history days imported`}
      </Text>
      {result.skippedNames.length > 0 ? (
        <Text textStyle={{ color: colors.success.foreground, fontSize: 13 }}>
          {`Skipped existing names: ${result.skippedNames.join(', ')}`}
        </Text>
      ) : null}
    </MessagePanel>
  );
}

function ReviewControls({
  duplicatePolicy,
  onDuplicatePolicyChange,
  onOptionsChange,
  options,
}: {
  duplicatePolicy: TickTickDuplicatePolicy;
  onDuplicatePolicyChange: (value: TickTickDuplicatePolicy) => void;
  onOptionsChange: (changes: Partial<TickTickImportOptions>) => void;
  options: TickTickImportOptions;
}) {
  const { colors } = useAppTheme();
  return (
    <Panel testID="ticktick-import-controls">
      <Text textStyle={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
        Import options
      </Text>
      <Switch
        label="Import check-in history"
        onValueChange={(value) => onOptionsChange({ importHistory: value })}
        testID="ticktick-import-history"
        value={options.importHistory}
      />
      <Switch
        disabled={!options.importHistory}
        label="Include incomplete and partially completed days"
        onValueChange={(value) => onOptionsChange({ includeIncomplete: value })}
        testID="ticktick-include-incomplete"
        value={options.includeIncomplete}
      />
      <Switch
        label="Keep TickTick archived habits archived"
        onValueChange={(value) => onOptionsChange({ preserveArchived: value })}
        testID="ticktick-preserve-archived"
        value={options.preserveArchived}
      />
      <Column spacing={6} style={{ width: '100%' }}>
        <Text textStyle={{ color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>
          Partially completed days
        </Text>
        <AccessiblePicker
          enabled={options.importHistory && options.includeIncomplete}
          label="Partially completed days"
          onValueChange={(value) =>
            onOptionsChange({
              partialPolicy: String(value) as TickTickImportOptions['partialPolicy'],
            })
          }
          selectedValue={options.partialPolicy}
          testID="ticktick-partial-policy"
        >
          <Picker.Item label="Mark as failed" value="failed" />
          <Picker.Item label="Mark as done" value="done" />
          <Picker.Item label="Skip these days" value="skip" />
        </AccessiblePicker>
      </Column>
      <Column spacing={6} style={{ width: '100%' }}>
        <Text textStyle={{ color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>
          Existing habit names
        </Text>
        <AccessiblePicker
          label="Existing habit names"
          onValueChange={(value) =>
            onDuplicatePolicyChange(String(value) as TickTickDuplicatePolicy)
          }
          selectedValue={duplicatePolicy}
          testID="ticktick-duplicate-policy"
        >
          <Picker.Item label="Skip existing names" value="skip" />
          <Picker.Item label="Import duplicates" value="import" />
        </AccessiblePicker>
      </Column>
      <Text textStyle={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>
        TickTick sections and reminders are shown in the preview but are not copied because Tulona
        has no equivalent fields. Count and minute goals become one binary completion per day.
      </Text>
    </Panel>
  );
}

function ReviewPanel({
  fileName,
  onClearSelection,
  onImport,
  onSelectAll,
  onToggle,
  options,
  preview,
  selectedKeys,
  setDuplicatePolicy,
  setOptions,
  busy,
  duplicatePolicy,
}: {
  fileName: string;
  onClearSelection: () => void;
  onImport: () => void;
  onSelectAll: () => void;
  onToggle: (key: string) => void;
  options: TickTickImportOptions;
  preview: TickTickWorkbookPreview;
  selectedKeys: ReadonlySet<string>;
  setDuplicatePolicy: (value: TickTickDuplicatePolicy) => void;
  setOptions: (changes: Partial<TickTickImportOptions>) => void;
  busy: boolean;
  duplicatePolicy: TickTickDuplicatePolicy;
}) {
  const { colors } = useAppTheme();
  const selectedCount = selectedKeys.size;
  return (
    <Column spacing={14} style={{ width: '100%' }}>
      <Panel testID="ticktick-import-file">
        <Text textStyle={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{fileName}</Text>
        <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
          {`${preview.habits.length} habits found · ${selectedCount} selected`}
        </Text>
        <Row spacing={8} style={{ width: '100%' }}>
          <AppButton
            disabled={busy}
            label="Select all"
            onPress={onSelectAll}
            style={{ height: 44, width: '48%' }}
            testID="ticktick-select-all"
            variant="outlined"
          />
          <AppButton
            disabled={busy}
            label="Clear"
            onPress={onClearSelection}
            style={{ height: 44, width: '48%' }}
            testID="ticktick-clear-selection"
            variant="outlined"
          />
        </Row>
      </Panel>
      <Panel testID="ticktick-habit-selection">
        <Text textStyle={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
          Habits to import
        </Text>
        <View
          style={{
            borderColor: colors.border,
            borderRadius: 12,
            borderWidth: 1,
            overflow: 'hidden',
            width: '100%',
          }}
        >
          {preview.habits.map((habit) => (
            <HabitChoice
              habit={habit}
              key={habit.key}
              onToggle={() => onToggle(habit.key)}
              selected={selectedKeys.has(habit.key)}
            />
          ))}
        </View>
      </Panel>
      <ReviewControls
        duplicatePolicy={duplicatePolicy}
        onDuplicatePolicyChange={setDuplicatePolicy}
        onOptionsChange={setOptions}
        options={options}
      />
      <SelectedWarnings preview={preview} selectedKeys={selectedKeys} />
      <AppButton
        disabled={busy || selectedCount === 0}
        label={
          busy
            ? 'Importing…'
            : `Import ${selectedCount} selected habit${selectedCount === 1 ? '' : 's'}`
        }
        onPress={onImport}
        style={{ height: 52, width: '100%' }}
        testID="ticktick-import-selected"
      />
    </Column>
  );
}

export default function HabitImportScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [runtime, setRuntime] = useState<HabitRuntime | null>(null);
  const [preview, setPreview] = useState<TickTickWorkbookPreview | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [options, setOptions] = useState<TickTickImportOptions>({
    ...DEFAULT_TICKTICK_IMPORT_OPTIONS,
  });
  const [duplicatePolicy, setDuplicatePolicy] = useState<TickTickDuplicatePolicy>('skip');
  const [result, setResult] = useState<HabitImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadHabitRuntime()
      .then((nextRuntime) => {
        if (!cancelled) setRuntime(nextRuntime);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorText(loadError));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const chooseFile = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/octet-stream',
        ],
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      const nextPreview = parseTickTickWorkbook(await readPickerBytes(asset));
      setPreview(nextPreview);
      setFileName(asset.name || 'TickTick habit export');
      setSelectedKeys(new Set(nextPreview.habits.map((habit) => habit.key)));
      setOptions({ ...DEFAULT_TICKTICK_IMPORT_OPTIONS });
      setDuplicatePolicy('skip');
    } catch (actionError) {
      setError(importErrorMessage(actionError));
    } finally {
      setBusy(false);
    }
  };

  const importSelected = async () => {
    if (!runtime || !preview || selectedKeys.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const inputs = buildTickTickImportInputs(preview, selectedKeys, options);
      const nextResult = await runtime.habitService.importHabits(inputs, { duplicatePolicy });
      setResult(nextResult);
      bootCoordinator.reset();
    } catch (actionError) {
      setError(errorText(actionError));
    } finally {
      setBusy(false);
    }
  };

  const clearReview = () => {
    setPreview(null);
    setFileName(null);
    setSelectedKeys(new Set());
    setResult(null);
    setError(null);
  };

  if (!runtime) {
    return (
      <Screen
        onBack={() => router.back()}
        title="Import TickTick habits"
        testID="habit-import-screen"
      >
        <Text
          textStyle={{ color: error ? colors.danger.foreground : colors.textMuted, fontSize: 15 }}
        >
          {error ?? 'Loading habit importer…'}
        </Text>
      </Screen>
    );
  }

  return (
    <Screen
      onBack={() => router.back()}
      title="Import TickTick habits"
      testID="habit-import-screen"
    >
      <Column spacing={14} style={{ width: '100%' }}>
        {!preview ? (
          <Panel testID="ticktick-import-start">
            <Text textStyle={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>
              Bring over a TickTick export
            </Text>
            <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
              Choose TickTick&apos;s XLSX habit export, review the individual sheets, and select
              exactly which habits and history to add to Tulona. Existing data stays in place.
            </Text>
            <AppButton
              disabled={busy}
              label={busy ? 'Reading export…' : 'Choose TickTick XLSX'}
              onPress={() => void chooseFile()}
              style={{ height: 52, width: '100%' }}
              testID="choose-ticktick-xlsx"
            />
          </Panel>
        ) : (
          <ReviewPanel
            busy={busy}
            duplicatePolicy={duplicatePolicy}
            fileName={fileName ?? 'TickTick habit export'}
            onClearSelection={() => setSelectedKeys(new Set())}
            onImport={() => void importSelected()}
            onSelectAll={() => setSelectedKeys(new Set(preview.habits.map((habit) => habit.key)))}
            onToggle={(key) =>
              setSelectedKeys((current) => {
                const next = new Set(current);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              })
            }
            options={options}
            preview={preview}
            selectedKeys={selectedKeys}
            setDuplicatePolicy={setDuplicatePolicy}
            setOptions={(changes) => setOptions((current) => ({ ...current, ...changes }))}
          />
        )}
        {busy && preview ? (
          <Text
            textStyle={{ color: colors.textMuted, fontSize: 14 }}
            testID="ticktick-import-progress"
          >
            Working…
          </Text>
        ) : null}
        {error ? (
          <MessagePanel tone="danger" testID="ticktick-import-error">
            <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{error}</Text>
            <Text textStyle={{ color: colors.danger.foreground, fontSize: 13 }}>
              No habits were changed by this failed action.
            </Text>
          </MessagePanel>
        ) : null}
        {result ? <ImportResultPanel result={result} /> : null}
        {preview ? (
          <Row spacing={8} style={{ width: '100%' }}>
            <AppButton
              disabled={busy}
              label="Choose another file"
              onPress={chooseFile}
              style={{ height: 48, width: '48%' }}
              testID="choose-another-ticktick-file"
              variant="outlined"
            />
            <AppButton
              disabled={busy}
              label="Start over"
              onPress={clearReview}
              style={{ height: 48, width: '48%' }}
              testID="reset-ticktick-import"
              variant="outlined"
            />
          </Row>
        ) : null}
      </Column>
    </Screen>
  );
}
