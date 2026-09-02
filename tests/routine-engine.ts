import {
  addRoutineTime,
  cancelRoutine,
  catchUpRoutine,
  completeRoutineStep,
  markRoutineAlarmFired,
  pauseRoutine,
  resumeRoutine,
  routineTiming,
  skipRoutineStep,
  startRoutine,
  RoutineAlarmService,
} from '../src/routine';
import type { RoutineSnapshot } from '../src/domain';

const ids = {
  routine: '11111111-1111-4111-8111-111111111111',
  first: '22222222-2222-4222-8222-222222222222',
  second: '33333333-3333-4333-8333-333333333333',
  third: '44444444-4444-4444-8444-444444444444',
};

const start = '2026-08-30T00:00:00.000Z';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function snapshot(
  behaviors: readonly ('overtime' | 'auto-advance')[] = ['overtime']
): RoutineSnapshot {
  const stepIds = [ids.first, ids.second, ids.third];
  return {
    id: ids.routine,
    name: 'Routine',
    trackingMode: 'overall',
    capturedAt: start,
    steps: behaviors.map((endBehavior, index) => ({
      id: stepIds[index],
      activityId: null,
      name: `Step ${index + 1}`,
      durationMs: (index + 1) * 1_000,
      sortOrder: index,
      color: null,
      iconName: null,
      endBehavior,
      notes: null,
    })),
  };
}

function at(offsetMs: number): string {
  return new Date(Date.parse(start) + offsetMs).toISOString();
}

async function run(): Promise<void> {
  const initial = startRoutine(snapshot(), start, { id: '88888888-8888-4888-8888-888888888888' });
  assert(routineTiming(initial, at(0)).remainingMs === 1_000, 'countdown starts from the deadline');
  assert(
    routineTiming(initial, at(500)).remainingMs === 500,
    'countdown derives from absolute time'
  );

  const paused = pauseRoutine(initial, at(500));
  assert(paused.status === 'paused', 'pause changes the durable state');
  assert(paused.remainingMsWhenPaused === 500, 'pause persists remaining time');
  assert(routineTiming(paused, at(5_000)).remainingMs === 500, 'pause freezes countdown');
  const extendedPaused = addRoutineTime(paused, 2_000, at(5_000));
  assert(extendedPaused.remainingMsWhenPaused === 2_500, 'add-time extends paused remaining time');
  const resumed = resumeRoutine(extendedPaused, at(10_000));
  assert(
    routineTiming(resumed, at(10_000)).remainingMs === 2_500,
    'resume derives a new deadline from persisted remaining time'
  );
  const overtimeExtended = addRoutineTime(resumed, 2_000, at(13_000));
  assert(
    routineTiming(overtimeExtended, at(13_000)).remainingMs === 1_500,
    'add-time extends the existing deadline rather than resetting duration'
  );
  const pausedOvertime = pauseRoutine(initial, at(2_000));
  assert(pausedOvertime.remainingMsWhenPaused === -1_000, 'pause preserves overtime position');
  assert(
    routineTiming(resumeRoutine(pausedOvertime, at(10_000)), at(10_000)).overtimeMs === 1_000,
    'resume preserves paused overtime'
  );

  const manuallyDone = completeRoutineStep(overtimeExtended, at(13_500));
  assert(
    manuallyDone.status === 'awaiting-next-activity',
    'final manual completion awaits chooser'
  );
  assert(
    manuallyDone.stepSessions[0]?.completedAt === at(13_500) &&
      manuallyDone.stepSessions[0]?.outcome === 'done',
    'manual completion records its exact action timestamp'
  );

  const multiStep = startRoutine(snapshot(['auto-advance', 'auto-advance', 'overtime']), start, {
    id: '99999999-9999-4999-8999-999999999999',
  });
  const recovered = catchUpRoutine(multiStep, at(10_000));
  assert(recovered.completedStepIds.length === 2, 'recovery advances every elapsed auto step');
  assert(recovered.activeRoutine.currentStepIndex === 2, 'recovery stops at the overtime step');
  assert(
    routineTiming(recovered.activeRoutine, at(10_000)).overtimeMs === 4_000,
    'overtime is computed from the current persisted deadline'
  );
  const repeated = catchUpRoutine(recovered.activeRoutine, at(10_000));
  assert(repeated.completedStepIds.length === 0, 'recovery does not duplicate completed history');
  assert(
    repeated.activeRoutine.stepSessions.filter((session) => session.status === 'completed')
      .length === 2,
    'completed step sessions remain immutable history'
  );
  const future = catchUpRoutine(startRoutine(snapshot(['auto-advance']), start), at(500));
  assert(future.completedStepIds.length === 0, 'catch-up stops before a future deadline');

  const allAutomatic = startRoutine(snapshot(['auto-advance', 'auto-advance']), start);
  const completed = catchUpRoutine(allAutomatic, at(10_000)).activeRoutine;
  assert(completed.status === 'awaiting-next-activity', 'automatic final step completes the run');
  assert(completed.completedAt === at(3_000), 'automatic completion uses the exact deadline');

  const skipped = skipRoutineStep(startRoutine(snapshot(['overtime', 'overtime']), start), at(100));
  assert(skipped.currentStepIndex === 1, 'skip advances exactly once');
  assert(skipped.stepSessions[0]?.outcome === 'skipped', 'skip records its outcome');
  const cancelled = cancelRoutine(skipped, at(200));
  assert(cancelled.status === 'cancelled', 'cancel produces an explicit cancelled state');

  const alarmGuarded = markRoutineAlarmFired(initial, ids.first);
  assert(alarmGuarded.alarmFiredStepIds?.length === 1, 'alarm firing is persisted per step');

  let plays = 0;
  const alarm = new RoutineAlarmService({
    enabled: true,
    source: 'bundled-test-source',
    audio: {
      async prepare() {
        return {
          volume: 0,
          play: () => {
            plays += 1;
          },
          remove: () => undefined,
        };
      },
    },
  });
  await alarm.prepare();
  const firstAlarm = await alarm.check(initial, at(1_000));
  const secondAlarm = await alarm.check(firstAlarm.activeRoutine, at(5_000));
  assert(firstAlarm.played && plays === 1, 'foreground alarm plays once at the deadline');
  assert(
    secondAlarm.reason === 'already-fired' && plays === 1,
    'overtime does not alarm every tick'
  );
}

run().catch((error: unknown) => {
  throw error;
});
