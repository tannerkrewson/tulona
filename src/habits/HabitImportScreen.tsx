import { Picker } from '@expo/ui';
import { Column, Text } from '@ui/primitives';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';
import { goBackInAppStack } from '../navigation/app-back';
import {
  errorText,
  Form,
  FormPickerRow,
  FormRow,
  FormSection,
  FormSwitchRow,
  HeaderTextButton,
  Screen,
} from '@ui';

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
  const details = [
    statusLabel(habit),
    formatHabitSchedule(habit.schedule),
    `${habit.checkIns.length.toLocaleString()} check-ins`,
    habit.goal ? `Goal: ${habit.goal}` : null,
  ]
    .filter((value): value is string => value !== null)
    .join(' · ');
  return (
    <Pressable
      accessibilityLabel={`${habit.name}, ${statusLabel(habit)}, ${formatHabitSchedule(habit.schedule)}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onToggle}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: pressed ? colors.border : 'transparent',
        flexDirection: 'row',
        gap: 12,
        minHeight: 64,
        paddingHorizontal: 16,
        paddingVertical: 10,
        width: '100%',
      })}
      testID={`ticktick-habit-${habit.key}`}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: selected ? colors.primary : 'transparent',
          borderColor: selected ? colors.primary : colors.textMuted,
          borderRadius: 12,
          borderWidth: 1.5,
          height: 24,
          justifyContent: 'center',
          width: 24,
        }}
      >
        {selected ? (
          <AppIcon color={colors.onPrimary} name="check" size={15} strokeWidth={3} />
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} textStyle={{ color: colors.text, fontSize: 17 }}>
          {habit.name}
        </Text>
        <Text
          numberOfLines={2}
          textStyle={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}
        >
          {details}
        </Text>
        <Text numberOfLines={1} textStyle={{ color: colors.textMuted, fontSize: 12 }}>
          {formatHistoryRange(habit)}
        </Text>
      </View>
    </Pressable>
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
    <FormSection
      footer={
        result.skippedNames.length > 0
          ? `Skipped because the name already exists: ${result.skippedNames.join(', ')}`
          : undefined
      }
      testID="ticktick-import-result"
      title="Imported"
    >
      <FormRow
        icon="check-circle-2"
        iconColor={colors.success.foreground}
        label="Habits added"
        value={`${result.imported.length}`}
      />
      <FormRow label="History days" value={result.importedStateCount.toLocaleString()} />
    </FormSection>
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
  return (
    <FormSection
      footer="TickTick sections and reminders aren’t copied. Count and minute goals become a simple done or not done for each day."
      testID="ticktick-import-controls"
      title="Options"
    >
      <FormSwitchRow
        label="Import History"
        onValueChange={(value) => onOptionsChange({ importHistory: value })}
        testID="ticktick-import-history"
        value={options.importHistory}
      />
      <FormSwitchRow
        disabled={!options.importHistory}
        label="Include Unfinished Days"
        onValueChange={(value) => onOptionsChange({ includeIncomplete: value })}
        testID="ticktick-include-incomplete"
        value={options.includeIncomplete}
      />
      <FormPickerRow
        enabled={options.importHistory && options.includeIncomplete}
        label="Partly Done Days"
        onValueChange={(value) =>
          onOptionsChange({
            partialPolicy: String(value) as TickTickImportOptions['partialPolicy'],
          })
        }
        selectedValue={options.partialPolicy}
        testID="ticktick-partial-policy"
      >
        <Picker.Item label="Missed" value="failed" />
        <Picker.Item label="Done" value="done" />
        <Picker.Item label="Leave out" value="skip" />
      </FormPickerRow>
      <FormSwitchRow
        label="Keep Archived Habits Archived"
        onValueChange={(value) => onOptionsChange({ preserveArchived: value })}
        testID="ticktick-preserve-archived"
        value={options.preserveArchived}
      />
      <FormPickerRow
        label="Name Already Exists"
        onValueChange={(value) => onDuplicatePolicyChange(String(value) as TickTickDuplicatePolicy)}
        selectedValue={duplicatePolicy}
        testID="ticktick-duplicate-policy"
      >
        <Picker.Item label="Skip" value="skip" />
        <Picker.Item label="Import anyway" value="import" />
      </FormPickerRow>
    </FormSection>
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
  const selectedCount = selectedKeys.size;
  const allSelected = selectedCount === preview.habits.length;
  return (
    <>
      <FormSection
        footer={`${selectedCount} of ${preview.habits.length} selected from ${fileName}`}
        headerAction={
          allSelected ? (
            <HeaderTextButton
              compact
              disabled={busy}
              label="Deselect All"
              onPress={onClearSelection}
              testID="ticktick-clear-selection"
            />
          ) : (
            <HeaderTextButton
              compact
              disabled={busy}
              label="Select All"
              onPress={onSelectAll}
              testID="ticktick-select-all"
            />
          )
        }
        testID="ticktick-habit-selection"
        title="Habits"
      >
        {preview.habits.map((habit) => (
          <HabitChoice
            habit={habit}
            key={habit.key}
            onToggle={() => onToggle(habit.key)}
            selected={selectedKeys.has(habit.key)}
          />
        ))}
      </FormSection>
      <ReviewControls
        duplicatePolicy={duplicatePolicy}
        onDuplicatePolicyChange={setDuplicatePolicy}
        onOptionsChange={setOptions}
        options={options}
      />
      <SelectedWarnings preview={preview} selectedKeys={selectedKeys} />
      <FormSection>
        <FormRow
          disabled={busy || selectedCount === 0}
          kind="action"
          label={
            busy ? 'Importing…' : `Import ${selectedCount} Habit${selectedCount === 1 ? '' : 's'}`
          }
          onPress={onImport}
          testID="ticktick-import-selected"
        />
      </FormSection>
    </>
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
        onBack={() => goBackInAppStack(router, '/settings/data')}
        title="TickTick Import"
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
      onBack={() => goBackInAppStack(router, '/settings/data')}
      title="TickTick Import"
      testID="habit-import-screen"
    >
      <Form>
        {error ? (
          <MessagePanel tone="danger" testID="ticktick-import-error">
            <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{error}</Text>
            <Text textStyle={{ color: colors.danger.foreground, fontSize: 13 }}>
              No habits were changed.
            </Text>
          </MessagePanel>
        ) : null}
        {result ? <ImportResultPanel result={result} /> : null}
        {!preview ? (
          <FormSection
            footer="In TickTick, export your habits as an .xlsx file. You’ll choose which habits to add before anything is imported."
            testID="ticktick-import-start"
          >
            <FormRow
              disabled={busy}
              kind="action"
              label={busy ? 'Reading File…' : 'Choose Export File'}
              onPress={() => void chooseFile()}
              testID="choose-ticktick-xlsx"
            />
          </FormSection>
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
        {preview ? (
          <FormSection>
            <FormRow
              disabled={busy}
              kind="action"
              label="Choose Another File"
              onPress={() => void chooseFile()}
              testID="choose-another-ticktick-file"
            />
            <FormRow
              disabled={busy}
              kind="action"
              label="Start Over"
              onPress={clearReview}
              testID="reset-ticktick-import"
            />
          </FormSection>
        ) : null}
      </Form>
    </Screen>
  );
}
