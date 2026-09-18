import { Text } from '@expo/ui';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import {
  formatDuration,
  type CatalogCollection,
  type HistoryPeriod,
  type HistoricalActivitySnapshot,
  type HistorySession,
  type TimeTransition,
} from '@domain';
import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { connectorRouteOffset, dayTimelineConnectorPath } from './history-connectors';
import { materializeDayTimelineEntries } from './history-day-data';
import {
  DAY_TIMELINE_MIN_MARKER_HEIGHT,
  DAY_TIMELINE_ROW_HEIGHT,
  layoutDayTimeline,
  type DayTimelineEntry,
  type DayTimelineRowGeometry,
} from './day-timeline-layout';

const HOUR_LABEL_WIDTH = 42;
const RAIL_LEFT = 53;
const RAIL_WIDTH = 12;
const CONNECTOR_ROW_LEFT = 91;
const CONNECTOR_GUTTER_RIGHT = 10;
const SESSION_ROW_HEIGHT = DAY_TIMELINE_ROW_HEIGHT;

interface SessionPresentation {
  entry: DayTimelineEntry;
  name: string;
  color: string;
  iconName: string;
  folderName: string | null;
}

export interface DayTimelineProps {
  catalog: CatalogCollection;
  period: HistoryPeriod;
  transitions: readonly TimeTransition[];
  testID?: string;
}

function safeActivityColor(color: string | null | undefined, fallback: string): string {
  return color && /^#[0-9a-f]{6}$/i.test(color.trim()) ? color.trim() : fallback;
}

function snapshotPresentation(
  snapshot: HistoricalActivitySnapshot,
  fallbackColor: string
): Omit<SessionPresentation, 'entry'> {
  return {
    name: snapshot.name,
    color: safeActivityColor(snapshot.color, fallbackColor),
    iconName: snapshot.iconName ?? 'activity',
    folderName: snapshot.folderName,
  };
}

function presentationFor(
  session: HistorySession,
  catalog: CatalogCollection,
  fallbackColor: string
): Omit<SessionPresentation, 'entry'> {
  if (session.activitySnapshot)
    return snapshotPresentation(session.activitySnapshot, fallbackColor);
  const resolved = resolveCatalogItem(catalog, session.activityId, fallbackColor);
  if (!resolved) {
    return {
      name: 'Archived activity',
      color: fallbackColor,
      iconName: 'activity',
      folderName: null,
    };
  }
  return {
    name: resolved.item.name,
    color: safeActivityColor(resolved.displayColor, fallbackColor),
    iconName: resolved.item.iconName ?? 'activity',
    folderName: resolved.folder?.name ?? null,
  };
}

function readableTime(value: number): string {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function sessionKey(row: Pick<DayTimelineRowGeometry, 'transitionId' | 'startMs'>): string {
  return `${row.transitionId}-${row.startMs}`;
}

function runningFor(period: HistoryPeriod, nowMs: number): boolean {
  return period.startMs <= nowMs && nowMs < period.endMs;
}

function SessionRow({
  geometry,
  presentation,
  onPress,
}: {
  geometry: DayTimelineRowGeometry;
  presentation: SessionPresentation;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const endLabel = presentation.entry.session.isRunning ? 'Now' : readableTime(geometry.endMs);
  const durationLabel = formatDuration(geometry.durationMs);
  const accessibilityLabel = `${presentation.name}, ${readableTime(geometry.startMs)} to ${endLabel}, ${durationLabel}${presentation.entry.session.isRunning ? ', running' : ''}`;
  const continuation = geometry.continuesBefore
    ? 'Continues from the previous day'
    : geometry.continuesAfter
      ? 'Continues into the next day'
      : null;

  return (
    <Pressable
      accessibilityHint="Opens this session"
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.sessionRow,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed ? styles.pressed : null,
      ]}
      testID={`history-session-row-${sessionKey(geometry)}`}
    >
      <View style={[styles.sessionAccent, { backgroundColor: presentation.color }]} />
      <View style={styles.sessionBody}>
        <View style={styles.sessionTitleLine}>
          <AppIcon
            accessibilityLabel={`${presentation.name} icon`}
            color={presentation.color}
            name={presentation.iconName}
            size={17}
            strokeWidth={2.4}
          />
          <View style={styles.sessionName}>
            <Text
              numberOfLines={1}
              textStyle={{ color: colors.text, fontSize: 15, fontWeight: '700' }}
            >
              {presentation.name}
            </Text>
          </View>
          {presentation.entry.session.isRunning ? (
            <View
              accessibilityLabel="Running"
              style={[styles.runningDot, { backgroundColor: presentation.color }]}
            />
          ) : null}
        </View>
        <View style={styles.sessionMetaLine}>
          <View style={styles.sessionMetaText}>
            <Text numberOfLines={1} textStyle={{ color: colors.textMuted, fontSize: 12 }}>
              {`${readableTime(geometry.startMs)} – ${endLabel}${
                continuation ? ` · ${continuation}` : ''
              }`}
            </Text>
          </View>
          <Text textStyle={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
            {durationLabel}
          </Text>
        </View>
        {presentation.folderName ? (
          <Text numberOfLines={1} textStyle={{ color: colors.textMuted, fontSize: 11 }}>
            {presentation.folderName}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function useLiveNow(period: HistoryPeriod, hasTransitions: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isCurrentDay = runningFor(period, nowMs);

  useEffect(() => {
    if (!isCurrentDay || !hasTransitions) return undefined;
    const update = () => setNowMs(Date.now());
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [hasTransitions, isCurrentDay, period.endMs, period.startMs]);

  return nowMs;
}

function sessionPresentationMap(
  entries: readonly DayTimelineEntry[],
  catalog: CatalogCollection,
  fallbackColor: string
): Map<string, SessionPresentation> {
  return new Map(
    entries.map((entry) => [
      sessionKey({ transitionId: entry.session.transitionId, startMs: entry.session.startMs }),
      { entry, ...presentationFor(entry.session, catalog, fallbackColor) },
    ])
  );
}

function DayRail({
  catalog,
  entries,
  layout,
  onSessionPress,
  fallbackColor,
}: {
  catalog: CatalogCollection;
  entries: readonly DayTimelineEntry[];
  layout: ReturnType<typeof layoutDayTimeline>;
  onSessionPress: (transitionId: string) => void;
  fallbackColor: string;
}) {
  const { colors } = useAppTheme();
  const presentation = useMemo(
    () => sessionPresentationMap(entries, catalog, fallbackColor),
    [catalog, entries, fallbackColor]
  );
  const railX = RAIL_LEFT + RAIL_WIDTH / 2;

  return (
    <View
      style={[styles.railContainer, { height: layout.contentHeight }]}
      testID="history-day-rail"
    >
      <View
        style={[
          styles.hourRail,
          { pointerEvents: 'none' },
          {
            backgroundColor: colors.border,
            height: layout.railHeight,
            left: RAIL_LEFT + (RAIL_WIDTH - 3) / 2,
          },
        ]}
      />
      {layout.hourTicks.map((tick) => (
        <View key={tick.atMs} style={[styles.hourTick, { pointerEvents: 'none', top: tick.y }]}>
          <Text textStyle={{ color: colors.textMuted, fontSize: 11, textAlign: 'right' }}>
            {tick.label}
          </Text>
        </View>
      ))}
      <View
        style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
        testID="history-connectors"
      >
        <Svg height={layout.contentHeight} width="100%">
          {layout.rows.map((row, index) => {
            const key = sessionKey(row);
            const item = presentation.get(key);
            if (!item) return null;
            const rowX = CONNECTOR_ROW_LEFT;
            return (
              <Path
                d={dayTimelineConnectorPath({
                  transitionId: row.transitionId,
                  railX,
                  railY: row.trueMidpointY,
                  rowX,
                  rowY: row.rowCenterY,
                  routeOffset: connectorRouteOffset(index),
                })}
                key={`connector-${key}`}
                stroke={colors.border}
                strokeLinecap="round"
                strokeWidth={1}
                fill="none"
                opacity={0.8}
              />
            );
          })}
        </Svg>
      </View>
      {layout.rows.map((row) => {
        const key = sessionKey(row);
        const item = presentation.get(key);
        if (!item) return null;
        return (
          <View
            key={`marker-${key}`}
            style={[
              styles.railMarker,
              {
                backgroundColor: item.color,
                height: Math.max(DAY_TIMELINE_MIN_MARKER_HEIGHT, row.markerHeight),
                left: RAIL_LEFT,
                pointerEvents: 'none',
                top: row.markerTop,
                width: RAIL_WIDTH,
              },
            ]}
          />
        );
      })}
      {layout.rows.map((row, index) => {
        const key = sessionKey(row);
        const item = presentation.get(key);
        if (!item) return null;
        const previous = layout.rows[index - 1];
        const sameColorAdjacent =
          previous &&
          Math.abs(previous.endMs - row.startMs) < 1 &&
          presentation.get(sessionKey(previous))?.color === item.color;
        return sameColorAdjacent ? (
          <View
            key={`separator-${key}`}
            style={[
              styles.sameColorSeparator,
              {
                backgroundColor: colors.background,
                left: RAIL_LEFT,
                pointerEvents: 'none',
                top: row.trueStartY - 0.5,
              },
            ]}
          />
        ) : null;
      })}
      {layout.rows.map((row) => {
        const key = sessionKey(row);
        const item = presentation.get(key);
        if (!item) return null;
        return (
          <View
            key={`row-${key}`}
            style={[
              styles.sessionRowPosition,
              {
                left: CONNECTOR_ROW_LEFT,
                right: CONNECTOR_GUTTER_RIGHT,
                top: row.rowTop,
              },
            ]}
          >
            <SessionRow
              geometry={row}
              onPress={() => onSessionPress(row.transitionId)}
              presentation={item}
            />
          </View>
        );
      })}
    </View>
  );
}

export default function DayTimeline({ catalog, period, transitions, testID }: DayTimelineProps) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const nowMs = useLiveNow(period, transitions.length > 0);
  const entries = useMemo(
    () => materializeDayTimelineEntries(transitions, period, nowMs),
    [nowMs, period, transitions]
  );
  const layout = useMemo(() => layoutDayTimeline(entries, period), [entries, period]);
  const totalMs = entries.reduce(
    (total, entry) => total + entry.session.endMs - entry.session.startMs,
    0
  );
  const hasRunningSession = entries.some((entry) => entry.session.isRunning);

  return (
    <View style={styles.root} testID={testID ?? 'history-day-view'}>
      <View style={styles.daySummary} testID="history-day-summary">
        <View>
          <Text textStyle={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
            {`${formatDuration(totalMs)} tracked`}
          </Text>
          <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>
            {`${entries.length} session${entries.length === 1 ? '' : 's'}`}
          </Text>
        </View>
        {hasRunningSession ? (
          <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>Running now</Text>
        ) : null}
      </View>
      {entries.length === 0 ? (
        <Text
          style={styles.emptyMessage}
          testID="history-day-empty"
          textStyle={{ color: colors.textMuted, fontSize: 14 }}
        >
          No tracked activity this day.
        </Text>
      ) : null}
      <DayRail
        catalog={catalog}
        entries={entries}
        fallbackColor={colors.primary}
        layout={layout}
        onSessionPress={(transitionId) => router.push(`/activity-session/${transitionId}`)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  daySummary: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingBottom: 12,
    width: '100%',
  },
  emptyMessage: {
    paddingBottom: 12,
  },
  railContainer: {
    position: 'relative',
    width: '100%',
  },
  hourRail: {
    borderRadius: 2,
    position: 'absolute',
    top: 0,
    width: 3,
  },
  hourTick: {
    left: 0,
    position: 'absolute',
    top: 0,
    width: HOUR_LABEL_WIDTH,
  },
  railMarker: {
    borderRadius: RAIL_WIDTH / 2,
    position: 'absolute',
  },
  sameColorSeparator: {
    height: 1,
    position: 'absolute',
    width: RAIL_WIDTH,
  },
  sessionRowPosition: {
    height: SESSION_ROW_HEIGHT,
    position: 'absolute',
  },
  sessionRow: {
    alignItems: 'stretch',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    minHeight: SESSION_ROW_HEIGHT,
    overflow: 'hidden',
  },
  sessionAccent: {
    width: 4,
  },
  sessionBody: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  sessionTitleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    minWidth: 0,
  },
  sessionName: {
    flex: 1,
    minWidth: 0,
  },
  sessionMetaLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
    paddingTop: 2,
  },
  sessionMetaText: {
    flex: 1,
    minWidth: 0,
  },
  runningDot: {
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  pressed: {
    opacity: 0.72,
  },
});
