import { Button, Column, Row, Text, TextInput } from '@expo/ui';
import { useState } from 'react';

import {
  formatDuration,
  timestampMs,
  toTimestamp,
  type CatalogCollection,
  type TimeTransition,
} from '@domain';
import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';

import { resolveCatalogItem } from '../catalog/catalog-service';

const MINUTE = 60_000;

interface StartChoice {
  label: string;
  minutes: number;
}

const START_CHOICES: StartChoice[] = [
  { label: 'Now', minutes: 0 },
  { label: '5 min ago', minutes: 5 },
  { label: '10 min ago', minutes: 10 },
  { label: '15 min ago', minutes: 15 },
  { label: '30 min ago', minutes: 30 },
  { label: '1 hour ago', minutes: 60 },
];

export interface AdjustStartSheetProps {
  activeTransition: TimeTransition;
  previousTransition: TimeTransition | null;
  catalog: CatalogCollection | null;
  nowMs: number;
  onAdjust: (timestamp: string) => Promise<void>;
  onClose: () => void;
  onHistory: () => void;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function localInputValue(timestamp: string): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocalInput(value: string): number | null {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function intervalLabel(
  transition: TimeTransition | null,
  catalog: CatalogCollection | null
): string {
  if (!transition || transition.activityId === null) return 'No activity';
  return catalog
    ? (resolveCatalogItem(catalog, transition.activityId)?.item.name ?? 'Unavailable')
    : 'Activity';
}

export function AdjustStartSheet({
  activeTransition,
  previousTransition,
  catalog,
  nowMs,
  onAdjust,
  onClose,
  onHistory,
}: AdjustStartSheetProps) {
  const { colors } = useAppTheme();
  const [selectedMinutes, setSelectedMinutes] = useState(0);
  const [exactValue, setExactValue] = useState(localInputValue(activeTransition.timestamp));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedMs =
    selectedMinutes === -1 ? parseLocalInput(exactValue) : nowMs - selectedMinutes * MINUTE;
  const previousMs = previousTransition ? timestampMs(previousTransition.timestamp) : null;
  const beforePrevious = selectedMs !== null && previousMs !== null && selectedMs < previousMs;
  const inFuture = selectedMs !== null && selectedMs > nowMs;
  const invalid = selectedMs === null || beforePrevious || inFuture;
  const currentName = intervalLabel(activeTransition, catalog);
  const previousName = intervalLabel(previousTransition, catalog);

  const selectExact = (value: string) => {
    setSelectedMinutes(-1);
    setExactValue(value);
    setError(null);
  };

  const apply = async () => {
    if (selectedMs === null) {
      setError('Enter a valid date and time.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAdjust(toTimestamp(selectedMs));
      onClose();
    } catch (adjustError) {
      setError(errorText(adjustError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Column
      spacing={14}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.primary,
        borderRadius: 22,
        borderWidth: 2,
        padding: 20,
        width: '100%',
      }}
      testID="adjust-start-sheet"
    >
      <Row alignment="center" spacing={10}>
        <AppIcon color={colors.primary} name="clock" size={25} />
        <Column spacing={2} style={{ width: '100%' }}>
          <Text textStyle={{ color: colors.text, fontSize: 21, fontWeight: '800' }}>
            Adjust start
          </Text>
          <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
            Move one persisted boundary. The adjacent intervals move together.
          </Text>
        </Column>
      </Row>
      <Column spacing={8} style={{ width: '100%' }}>
        {[START_CHOICES.slice(0, 3), START_CHOICES.slice(3)].map((row, rowIndex) => (
          <Row key={rowIndex} alignment="center" spacing={8}>
            {row.map((choice) => {
              const candidateMs = nowMs - choice.minutes * MINUTE;
              const disabled = previousMs !== null && candidateMs < previousMs;
              return (
                <Button
                  key={choice.minutes}
                  disabled={busy || disabled}
                  label={choice.label}
                  onPress={() => {
                    setSelectedMinutes(choice.minutes);
                    setError(null);
                  }}
                  testID={`adjust-start-${choice.minutes}`}
                  variant={selectedMinutes === choice.minutes ? 'filled' : 'outlined'}
                />
              );
            })}
          </Row>
        ))}
      </Column>
      <Column spacing={6} style={{ width: '100%' }}>
        <Text textStyle={{ color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>
          Exact time
        </Text>
        <TextInput
          onChangeText={selectExact}
          testID="adjust-start-exact-time"
          defaultValue={exactValue}
          style={{
            borderColor: colors.border,
            borderRadius: 10,
            borderWidth: 1,
            paddingHorizontal: 12,
            paddingVertical: 10,
            width: '100%',
          }}
          textStyle={{ color: colors.text, fontSize: 16 }}
        />
      </Column>
      <Column
        spacing={5}
        style={{
          backgroundColor: colors.surfaceMuted,
          borderColor: beforePrevious || inFuture ? colors.danger.foreground : colors.border,
          borderRadius: 14,
          borderWidth: 1,
          padding: 14,
          width: '100%',
        }}
        testID="adjust-start-preview"
      >
        <Text textStyle={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>
          Adjacent interval preview
        </Text>
        <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
          {previousTransition && selectedMs !== null
            ? `${previousName} ends at ${new Date(selectedMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. ${currentName} starts there and would run for ${formatDuration(Math.max(0, nowMs - selectedMs))}.`
            : selectedMs !== null
              ? `${currentName} would start at ${new Date(selectedMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} and run for ${formatDuration(Math.max(0, nowMs - selectedMs))}.`
              : 'Enter a valid time to preview the boundary.'}
        </Text>
        {beforePrevious ? (
          <Text textStyle={{ color: colors.danger.foreground, fontSize: 14, fontWeight: '700' }}>
            The start cannot precede the immediately preceding transition.
          </Text>
        ) : null}
        {inFuture ? (
          <Text textStyle={{ color: colors.danger.foreground, fontSize: 14, fontWeight: '700' }}>
            The start cannot be in the future.
          </Text>
        ) : null}
      </Column>
      {error ? (
        <Column
          spacing={4}
          style={{
            backgroundColor: colors.danger.background,
            borderColor: colors.danger.foreground,
            borderRadius: 12,
            borderWidth: 1,
            padding: 12,
            width: '100%',
          }}
          testID="adjust-start-error"
        >
          <Text textStyle={{ color: colors.danger.foreground, fontSize: 14, fontWeight: '700' }}>
            Adjust start failed
          </Text>
          <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{error}</Text>
        </Column>
      ) : null}
      <Button
        disabled={busy || invalid}
        label={busy ? 'Saving boundary...' : error ? 'Try again' : 'Save adjusted start'}
        onPress={() => void apply()}
        testID="save-adjusted-start"
      />
      <Row alignment="center" spacing={10}>
        <Button
          disabled={busy}
          label="History"
          onPress={onHistory}
          testID="open-history-from-adjust"
          variant="outlined"
        />
        <Button disabled={busy} label="Close" onPress={onClose} variant="text" />
      </Row>
    </Column>
  );
}
