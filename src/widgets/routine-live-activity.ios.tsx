import { HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  clipped,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  opacity,
  padding,
  progressViewStyle,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivity } from 'expo-widgets';

import type { RoutineSurfaceProps } from './active-activity-widget-shared';

const RoutineLiveActivityLayout = (props: RoutineSurfaceProps) => {
  'widget';

  const detail = props.paused
    ? 'Paused'
    : props.overtime
      ? 'Over time'
      : props.nextStepName
        ? `Up next: ${props.nextStepName}`
        : 'Last step';
  const timer = (size: number) =>
    props.paused ? (
      <Text
        modifiers={[
          font({ design: 'rounded', size, weight: 'semibold' }),
          monospacedDigit(),
          opacity(0.6),
        ]}
      >
        {props.remainingLabel}
      </Text>
    ) : (
      <Text
        date={new Date(props.stepEndsAtMs)}
        dateStyle="timer"
        modifiers={[
          font({ design: 'rounded', size, weight: 'semibold' }),
          monospacedDigit(),
          lineLimit(1),
          foregroundStyle(props.overtime ? '#FF9F0A' : props.color),
        ]}
      />
    );
  const progress = props.paused ? null : (
    <ProgressView
      timerInterval={{
        lower: new Date(props.stepStartedAtMs),
        upper: new Date(Math.max(props.stepStartedAtMs, props.stepEndsAtMs)),
      }}
      countsDown={false}
      modifiers={[
        progressViewStyle('linear'),
        tint(props.color),
        frame({ height: 4, alignment: 'top' }),
        clipped(),
      ]}
    />
  );
  const routineLabel = (
    <HStack spacing={5}>
      <Image systemName="arrow.triangle.2.circlepath" size={11} color={props.color} />
      <Text
        modifiers={[
          font({ design: 'rounded', size: 13, weight: 'semibold' }),
          foregroundStyle(props.color),
          lineLimit(1),
        ]}
      >
        {props.routineName}
      </Text>
    </HStack>
  );

  return {
    banner: (
      <VStack alignment="leading" spacing={10} modifiers={[padding({ all: 16 })]}>
        <HStack alignment="center" spacing={12}>
          <VStack alignment="leading" spacing={3}>
            {routineLabel}
            <Text modifiers={[font({ design: 'rounded', size: 20, weight: 'bold' }), lineLimit(1)]}>
              {props.stepName}
            </Text>
            <Text
              modifiers={[
                font({ design: 'rounded', size: 13, weight: 'medium' }),
                opacity(0.6),
                lineLimit(1),
              ]}
            >
              {`${props.stepLabel} · ${detail}`}
            </Text>
          </VStack>
          <Spacer />
          {timer(34)}
        </HStack>
        {progress}
      </VStack>
    ),
    compactLeading: (
      <Image systemName="arrow.triangle.2.circlepath" size={14} color={props.color} />
    ),
    compactTrailing: (
      <HStack modifiers={[frame({ width: 52, alignment: 'trailing' })]}>{timer(14)}</HStack>
    ),
    minimal: <Image systemName="arrow.triangle.2.circlepath" size={13} color={props.color} />,
    expandedLeading: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ leading: 6, top: 4 })]}>
        {routineLabel}
        <Text modifiers={[font({ design: 'rounded', size: 18, weight: 'bold' }), lineLimit(1)]}>
          {props.stepName}
        </Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" modifiers={[padding({ trailing: 6, top: 4 })]}>
        {timer(30)}
      </VStack>
    ),
    expandedBottom: (
      <VStack alignment="leading" spacing={8} modifiers={[padding({ horizontal: 6, bottom: 4 })]}>
        {progress}
        <Text
          modifiers={[
            font({ design: 'rounded', size: 13, weight: 'medium' }),
            opacity(0.6),
            lineLimit(1),
          ]}
        >
          {`${props.stepLabel} · ${detail}`}
        </Text>
      </VStack>
    ),
  };
};

const routineLiveActivity = createLiveActivity<RoutineSurfaceProps>(
  'RoutineLiveActivity',
  RoutineLiveActivityLayout
);

let currentUrl: string | null = null;
let lastPublished = '';

function endAll(instances: LiveActivity<RoutineSurfaceProps>[]): void {
  for (const instance of instances) void instance.end('immediate').catch(() => undefined);
}

/** Starts, updates, or ends the lock screen routine activity; null means no routine is in focus. */
export function syncRoutineLiveActivity(props: RoutineSurfaceProps | null): void {
  try {
    const instances = routineLiveActivity.getInstances();
    if (!props) {
      endAll(instances);
      currentUrl = null;
      lastPublished = '';
      return;
    }
    const published = JSON.stringify(props);
    const [current, ...extra] = instances;
    endAll(extra);
    if (current && (currentUrl === null || currentUrl === props.url)) {
      if (published === lastPublished) return;
      currentUrl = props.url;
      lastPublished = published;
      void current.update(props).catch(() => undefined);
      return;
    }
    if (current) endAll([current]);
    routineLiveActivity.start(props, props.url);
    currentUrl = props.url;
    lastPublished = published;
  } catch {
    // Live Activities can be disabled by the user; the in-app runner stays authoritative.
  }
}
