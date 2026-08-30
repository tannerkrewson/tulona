import { Button, Column, Row, Text } from '@expo/ui';
import { useIsFocused } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';

import { formatDuration, logicalDayKey, type LogicalDayKey } from '@domain';
import { useAppTheme } from '@theme';
import { Screen } from '@ui';

import type { DailyReport, ReportFolder, ReportItem, WeeklyReport } from './reporting-service';
import { loadReportingRuntime, type ReportingRuntime } from './reporting-runtime';

type ReportView = 'day' | 'week';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function dayDate(day: LogicalDayKey): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, 12);
}

function shiftDay(day: LogicalDayKey, amount: number): LogicalDayKey {
  const date = dayDate(day);
  date.setDate(date.getDate() + amount);
  return logicalDayKey(date);
}

function readableDay(day: LogicalDayKey): string {
  return dayDate(day).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function readableTime(value: number): string {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function ReportCard({ children, testID }: { children: ReactNode; testID?: string }) {
  const { colors } = useAppTheme();
  return (
    <Column
      spacing={12}
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

function ProportionalRow({ item, maxMs }: { item: ReportItem | ReportFolder; maxMs: number }) {
  const { colors } = useAppTheme();
  const percentage = maxMs > 0 ? Math.max(5, (item.durationMs / maxMs) * 100) : 0;
  return (
    <Column spacing={6} style={{ width: '100%' }} testID={`proportional-${item.id ?? 'unfiled'}`}>
      <Row alignment="center" spacing={8} style={{ width: '100%' }}>
        <Column style={{ width: '72%' }}>
          <Text textStyle={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
            {item.name}
          </Text>
        </Column>
        <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
          {formatDuration(item.durationMs)}
        </Text>
      </Row>
      <Column
        style={{
          backgroundColor: colors.surfaceMuted,
          borderRadius: 99,
          height: 12,
          width: '100%',
        }}
        testID={`${item.id ?? 'unfiled'}-proportional-bar`}
      >
        <Column
          style={{
            backgroundColor: item.displayColor,
            borderRadius: 99,
            height: 12,
            width: `${percentage}%`,
          }}
        />
      </Column>
    </Column>
  );
}

function Breakdown({
  title,
  items,
  testID,
}: {
  title: string;
  items: ReportItem[] | ReportFolder[];
  testID: string;
}) {
  const { colors } = useAppTheme();
  const maxMs = Math.max(...items.map((item) => item.durationMs), 0);
  return (
    <ReportCard testID={testID}>
      <Text textStyle={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{title}</Text>
      {items.length === 0 ? (
        <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
          No tracked time in this range.
        </Text>
      ) : (
        items.map((item) => (
          <ProportionalRow item={item} key={item.id ?? 'unfiled'} maxMs={maxMs} />
        ))
      )}
    </ReportCard>
  );
}

function DayReport({ report }: { report: DailyReport }) {
  const { colors } = useAppTheme();
  return (
    <Column spacing={14} style={{ width: '100%' }}>
      <ReportCard testID="daily-total">
        <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>Total tracked time</Text>
        <Text textStyle={{ color: colors.text, fontSize: 36, fontWeight: '700' }}>
          {report.totalFormatted}
        </Text>
        <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>{report.logicalDay}</Text>
        <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
          {report.currentActiveItem
            ? `Current item: ${report.currentActiveItem.name}`
            : 'Nothing is currently active'}
        </Text>
      </ReportCard>
      <Breakdown items={report.activities} testID="activity-breakdown" title="Activities" />
      <Breakdown items={report.routines} testID="routine-breakdown" title="Routines" />
      <Breakdown items={report.folders} testID="folder-breakdown" title="Folders" />
      <ReportCard testID="timeline">
        <Text textStyle={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Timeline</Text>
        {report.timeline.length === 0 ? (
          <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>No intervals recorded.</Text>
        ) : (
          report.timeline.map((entry) => (
            <Row
              alignment="center"
              key={`${entry.transitionId}-${entry.startMs}`}
              spacing={10}
              style={{ width: '100%' }}
            >
              <Column style={{ width: '30%' }}>
                <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>
                  {readableTime(entry.startMs)}
                </Text>
                <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>
                  {readableTime(entry.endMs)}
                </Text>
              </Column>
              <Column spacing={2} style={{ width: '65%' }}>
                <Text textStyle={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
                  {entry.name}
                </Text>
                <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>
                  {formatDuration(entry.durationMs)}
                </Text>
              </Column>
            </Row>
          ))
        )}
      </ReportCard>
    </Column>
  );
}

function WeekReport({ report }: { report: WeeklyReport }) {
  const { colors } = useAppTheme();
  const maxMs = Math.max(...report.daily.map((day) => day.totalMs), 0);
  return (
    <Column spacing={14} style={{ width: '100%' }}>
      <ReportCard testID="weekly-total">
        <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>Week total</Text>
        <Text textStyle={{ color: colors.text, fontSize: 36, fontWeight: '700' }}>
          {report.totalFormatted}
        </Text>
        <Text
          textStyle={{ color: colors.textMuted, fontSize: 14 }}
        >{`${report.start} to ${report.end}`}</Text>
      </ReportCard>
      <ReportCard testID="daily-totals">
        <Text textStyle={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
          Daily totals
        </Text>
        {report.daily.map((day) => (
          <ProportionalRow
            item={{
              id: day.logicalDay,
              name: day.logicalDay,
              durationMs: day.totalMs,
              displayColor: colors.primary,
              isArchived: false,
            }}
            key={day.logicalDay}
            maxMs={maxMs}
          />
        ))}
      </ReportCard>
      <Breakdown items={report.activities} testID="weekly-activity-breakdown" title="Activities" />
      <Breakdown items={report.routines} testID="weekly-routine-breakdown" title="Routines" />
      <Breakdown items={report.folders} testID="weekly-folder-breakdown" title="Folders" />
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
  const [day, setDay] = useState(initialDay);
  const [view, setView] = useState<ReportView>('day');
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

  return (
    <Screen title="Insights" description="See where your time went, by logical day or week.">
      <Column spacing={14} style={{ width: '100%' }}>
        <Row alignment="center" spacing={8} style={{ width: '100%' }}>
          <Button
            label="Previous"
            onPress={() => setDay(shiftDay(day, view === 'day' ? -1 : -7))}
            testID="insights-previous"
          />
          <Button
            label="Today"
            onPress={() =>
              void runtime.reportingService
                .today()
                .then((today) => setDay(today.logicalDay))
                .catch((todayError: unknown) => setError(errorText(todayError)))
            }
            testID="insights-today"
          />
          <Button
            label="Next"
            onPress={() => setDay(shiftDay(day, view === 'day' ? 1 : 7))}
            testID="insights-next"
          />
        </Row>
        <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>{readableDay(day)}</Text>
        <Row alignment="center" spacing={8} style={{ width: '100%' }}>
          <Button label="Day view" onPress={() => setView('day')} testID="insights-day-view" />
          <Button label="Week view" onPress={() => setView('week')} testID="insights-week-view" />
        </Row>
        {error ? (
          <ReportCard testID="insights-error">
            <Text textStyle={{ color: colors.danger.foreground, fontSize: 15, fontWeight: '700' }}>
              Insights unavailable
            </Text>
            <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{error}</Text>
            <Button
              label="Retry"
              onPress={() => setReloadToken((value) => value + 1)}
              testID="insights-retry"
            />
          </ReportCard>
        ) : view === 'day' ? (
          report ? (
            <DayReport report={report} />
          ) : (
            <Text textStyle={{ color: colors.textMuted }}>Loading insights...</Text>
          )
        ) : week ? (
          <WeekReport report={week} />
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
  const [runtime, setRuntime] = useState<ReportingRuntime | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
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
  }, [focused]);

  if (!runtime) {
    return (
      <Screen title="Insights" description="See where your time went, by logical day or week.">
        <Text
          textStyle={{
            color: loadError ? colors.danger.foreground : colors.textMuted,
            fontSize: 15,
          }}
        >
          {loadError ?? 'Loading insights...'}
        </Text>
      </Screen>
    );
  }
  return <InsightsContent initialDay={initialDay} key={initialDay} runtime={runtime} />;
}
