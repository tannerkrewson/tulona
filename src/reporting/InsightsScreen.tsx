import { Column, Row, Text } from '@expo/ui';
import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import {
  dateForLogicalDay,
  formatDuration,
  logicalDayKey,
  shiftLogicalDay,
  type LogicalDayKey,
} from '@domain';
import { useAppTheme } from '@theme';
import { AppButton, errorText, Screen } from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';

import type { DailyReport, ReportFolder, ReportItem, WeeklyReport } from './reporting-service';
import { loadReportingRuntime, type ReportingRuntime } from './reporting-runtime';
import { EmptyNote, SectionCard, SegmentedOptions, ShareBar, SummaryHero } from './insights-shared';

type RangeView = 'day' | 'week';
type ItemFilter = 'all' | 'activity' | 'routine';

function readableDay(day: LogicalDayKey): string {
  return dateForLogicalDay(day).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function readableTime(value: number): string {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function filteredItems(report: { items: ReportItem[] }, filter: ItemFilter): ReportItem[] {
  if (filter === 'all') return report.items.filter((item) => item.kind !== 'untracked');
  return report.items.filter((item) => item.kind === filter);
}

function BreakdownCard({
  items,
  folders,
  totalMs,
  testID,
}: {
  items: ReportItem[];
  folders: ReportFolder[];
  totalMs: number;
  testID: string;
}) {
  const [tab, setTab] = useState<'items' | 'folders'>('items');
  const [filter, setFilter] = useState<ItemFilter>('all');
  const visible = useMemo(
    () => (tab === 'items' ? filteredItems({ items }, filter) : []),
    [filter, items, tab]
  );

  return (
    <SectionCard
      subtitle="Each bar is a share of the period total."
      testID={testID}
      title="Where time went"
    >
      <SegmentedOptions
        onChange={setTab}
        options={[
          { label: 'Items', value: 'items' },
          { label: 'Folders', value: 'folders' },
        ]}
        testIDPrefix={`${testID}-tab`}
        value={tab}
      />
      {tab === 'items' ? (
        <SegmentedOptions
          onChange={setFilter}
          options={[
            { label: 'All', value: 'all' },
            { label: 'Activities', value: 'activity' },
            { label: 'Routines', value: 'routine' },
          ]}
          testIDPrefix={`${testID}-filter`}
          value={filter}
        />
      ) : null}
      {tab === 'items' ? (
        visible.length === 0 ? (
          <EmptyNote message="No tracked items in this range." />
        ) : (
          visible
            .slice(0, 12)
            .map((item) => (
              <ShareBar
                color={item.displayColor}
                durationMs={item.durationMs}
                key={item.id ?? item.name}
                meta={item.folderName ?? (item.isArchived ? 'Archived' : undefined)}
                name={item.name}
                totalMs={totalMs}
              />
            ))
        )
      ) : folders.length === 0 ? (
        <EmptyNote message="No tracked folders in this range." />
      ) : (
        folders.map((folder) => (
          <ShareBar
            color={folder.displayColor}
            durationMs={folder.durationMs}
            key={folder.id ?? folder.name}
            name={folder.name}
            totalMs={totalMs}
          />
        ))
      )}
    </SectionCard>
  );
}

function DayView({ report, day }: { report: DailyReport; day: LogicalDayKey }) {
  const router = useRouter();
  const preview = report.timeline.slice(0, 8);
  return (
    <Column spacing={14} style={{ width: '100%' }}>
      <SummaryHero
        detail={readableDay(day)}
        eyebrow="Total tracked"
        footnote={
          report.currentActiveItem
            ? `Active now: ${report.currentActiveItem.name}`
            : 'Nothing is currently active'
        }
        testID="daily-total"
        total={report.totalFormatted}
      />
      <BreakdownCard
        folders={report.folders}
        items={report.items}
        testID="insights-breakdown"
        totalMs={report.totalMs}
      />
      <SectionCard
        subtitle="Chronological order. Corrections live in History."
        testID="timeline"
        title="Timeline"
      >
        {report.timeline.length === 0 ? (
          <EmptyNote message="No intervals recorded." />
        ) : (
          preview.map((entry) => (
            <Column key={`${entry.transitionId}-${entry.startMs}`} spacing={2}>
              <Text textStyle={{ fontSize: 15, fontWeight: '600' }}>{entry.name}</Text>
              <Text textStyle={{ fontSize: 13 }}>
                {`${readableTime(entry.startMs)} – ${readableTime(entry.endMs)} · ${formatDuration(entry.durationMs)}`}
              </Text>
            </Column>
          ))
        )}
        {report.timeline.length > preview.length ? (
          <EmptyNote
            message={`Showing ${preview.length} of ${report.timeline.length} intervals.`}
          />
        ) : null}
        <AppButton
          label="Open history to review or correct"
          onPress={() => router.push(`/history?day=${day}`)}
          style={{ height: 48 }}
          testID="insights-history"
          variant="outlined"
        />
      </SectionCard>
    </Column>
  );
}

function WeekView({ report }: { report: WeeklyReport }) {
  const { colors } = useAppTheme();
  return (
    <Column spacing={14} style={{ width: '100%' }}>
      <SummaryHero
        detail={`${report.start} to ${report.end}`}
        eyebrow="Week total"
        testID="weekly-total"
        total={report.totalFormatted}
      />
      <SectionCard
        subtitle="Each bar is a share of the week total."
        testID="daily-totals"
        title="Daily totals"
      >
        {report.daily.map((day) => (
          <ShareBar
            color={colors.primary}
            durationMs={day.totalMs}
            key={day.logicalDay}
            name={readableDay(day.logicalDay)}
            totalMs={report.totalMs}
          />
        ))}
      </SectionCard>
      <BreakdownCard
        folders={report.folders}
        items={report.items}
        testID="insights-breakdown"
        totalMs={report.totalMs}
      />
    </Column>
  );
}

function InsightsContent({
  runtime,
  initialDay,
}: {
  runtime: ReportingRuntime;
  initialDay: LogicalDayKey;
}) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const rolloverHour = runtime.settings.logicalDayRolloverHour;
  const [day, setDay] = useState(initialDay);
  const [view, setView] = useState<RangeView>('day');
  const [report, setReport] = useState<DailyReport | null>(null);
  const [week, setWeek] = useState<WeeklyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load =
      view === 'day' ? runtime.reportingService.getDay(day) : runtime.reportingService.getWeek(day);
    void load
      .then((result) => {
        if (cancelled) return;
        setError(null);
        if (view === 'day') setReport(result as DailyReport);
        else setWeek(result as WeeklyReport);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorText(loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [day, reloadToken, runtime, view]);

  const shift = (amount: number) => setDay(shiftLogicalDay(day, amount, { rolloverHour }));
  const rangeLabel =
    view === 'day' ? readableDay(day) : week ? `${week.start} to ${week.end}` : readableDay(day);

  return (
    <Screen title="Insights" description="Totals, breakdowns, and timeline.">
      <Column spacing={14} style={{ width: '100%' }}>
        <SectionCard testID="insights-range" title="Range">
          <SegmentedOptions
            onChange={setView}
            options={[
              { label: 'Day', testID: 'insights-day-view', value: 'day' },
              { label: 'Week', testID: 'insights-week-view', value: 'week' },
            ]}
            testIDPrefix="insights-view"
            value={view}
          />
          <Row alignment="center" spacing={8} style={{ width: '100%' }}>
            <AppButton
              label="‹ Prev"
              onPress={() => shift(view === 'day' ? -1 : -7)}
              style={{ height: 48, width: '31%' }}
              testID="insights-previous"
              variant="outlined"
            />
            <AppButton
              label="Today"
              onPress={() =>
                void runtime.reportingService
                  .today()
                  .then((today) => {
                    setDay(today.logicalDay);
                    setView('day');
                  })
                  .catch((todayError: unknown) => setError(errorText(todayError)))
              }
              style={{ height: 48, width: '31%' }}
              testID="insights-today"
              variant="outlined"
            />
            <AppButton
              label="Next ›"
              onPress={() => shift(view === 'day' ? 1 : 7)}
              style={{ height: 48, width: '31%' }}
              testID="insights-next"
              variant="outlined"
            />
          </Row>
          <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>{rangeLabel}</Text>
        </SectionCard>
        {error ? (
          <SectionCard testID="insights-error" title="Insights unavailable">
            <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{error}</Text>
            <RecoveryActions
              onBack={() => router.replace('/(tabs)')}
              onRetry={() => setReloadToken((value) => value + 1)}
              retryTestID="insights-retry"
              testID="insights-recovery"
            />
          </SectionCard>
        ) : view === 'day' ? (
          report ? (
            <DayView day={day} report={report} />
          ) : (
            <Text textStyle={{ color: colors.textMuted }}>Loading insights...</Text>
          )
        ) : week ? (
          <WeekView report={week} />
        ) : (
          <Text textStyle={{ color: colors.textMuted }}>Loading insights...</Text>
        )}
      </Column>
    </Screen>
  );
}

export default function InsightsScreen() {
  const { colors } = useAppTheme();
  const focused = useIsFocused();
  const router = useRouter();
  const [runtime, setRuntime] = useState<ReportingRuntime | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [initialDay, setInitialDay] = useState<LogicalDayKey>(() => logicalDayKey(Date.now()));

  useEffect(() => {
    if (!focused) return;
    let cancelled = false;
    void loadReportingRuntime()
      .then(async (nextRuntime) => {
        const today = await nextRuntime.reportingService.today();
        if (cancelled) return;
        setRuntime(nextRuntime);
        setInitialDay(today.logicalDay);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, [focused, reloadToken]);

  if (!runtime) {
    return (
      <Screen title="Insights" description="Totals, breakdowns, and timeline.">
        <Text
          textStyle={{
            color: loadError ? colors.danger.foreground : colors.textMuted,
            fontSize: 15,
          }}
        >
          {loadError ?? 'Loading insights...'}
        </Text>
        {loadError ? (
          <RecoveryActions
            onBack={() => router.replace('/(tabs)')}
            onRetry={() => {
              setLoadError(null);
              setRuntime(null);
              setReloadToken((value) => value + 1);
            }}
            retryTestID="insights-load-retry"
            testID="insights-load-recovery"
          />
        ) : null}
      </Screen>
    );
  }
  return <InsightsContent initialDay={initialDay} key={initialDay} runtime={runtime} />;
}
