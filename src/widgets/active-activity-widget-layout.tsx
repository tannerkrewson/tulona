import { HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  clipped,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  opacity,
  progressViewStyle,
  tint,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

// Bundled on its own into the widget extension (app.json `initialLayout`), where
// every package import except expo-widgets resolves to an empty module.
import type { ActiveActivityWidgetProps } from './active-activity-widget-shared';

const ActiveActivityWidgetLayout = (
  input: ActiveActivityWidgetProps | undefined,
  environment: WidgetEnvironment
) => {
  'widget';

  const props: ActiveActivityWidgetProps =
    input && input.mode
      ? input
      : {
          mode: 'idle',
          name: 'Tulona',
          startedAtMs: 0,
          color: '#1C1C1E',
          foregroundColor: '#FFFFFF',
          url: 'tulona://',
        };
  const idleHint =
    input && input.mode ? 'Tap to start an activity' : 'Open Tulona to show your activity';
  const isMedium = environment.widgetFamily === 'systemMedium';
  const fg = props.foregroundColor;
  const fill = frame({ maxWidth: 1000, maxHeight: 1000, alignment: 'topLeading' });
  const root = [fill, containerBackground(props.color, 'widget'), widgetURL(props.url)];

  if (props.mode === 'routine' && props.routine) {
    const routine = props.routine;
    const status = routine.paused ? 'Paused' : routine.overtime ? 'Over time' : routine.stepLabel;
    const timer = routine.paused ? (
      <Text
        modifiers={[
          font({ design: 'rounded', size: isMedium ? 40 : 32, weight: 'bold' }),
          monospacedDigit(),
          foregroundStyle(fg),
          opacity(0.7),
        ]}
      >
        {routine.remainingLabel}
      </Text>
    ) : (
      <Text
        date={new Date(routine.stepEndsAtMs)}
        dateStyle="timer"
        modifiers={[
          font({ design: 'rounded', size: isMedium ? 40 : 32, weight: 'bold' }),
          monospacedDigit(),
          lineLimit(1),
          minimumScaleFactor(0.6),
          foregroundStyle(fg),
        ]}
      />
    );
    const progress = routine.paused ? null : (
      <ProgressView
        timerInterval={{
          lower: new Date(routine.stepStartedAtMs),
          upper: new Date(Math.max(routine.stepStartedAtMs, routine.stepEndsAtMs)),
        }}
        countsDown={false}
        modifiers={[
          progressViewStyle('linear'),
          tint(fg),
          frame({ height: 4, alignment: 'top' }),
          clipped(),
        ]}
      />
    );

    return (
      <VStack alignment="leading" spacing={4} modifiers={root}>
        <HStack spacing={5}>
          <Image
            systemName="arrow.triangle.2.circlepath"
            size={11}
            color={fg}
            modifiers={[opacity(0.8)]}
          />
          <Text
            modifiers={[
              font({ design: 'rounded', size: 12, weight: 'semibold' }),
              foregroundStyle(fg),
              opacity(0.8),
              lineLimit(1),
            ]}
          >
            {routine.routineName}
          </Text>
          <Spacer />
          {isMedium ? (
            <Text
              modifiers={[
                font({ design: 'rounded', size: 12, weight: 'medium' }),
                foregroundStyle(fg),
                opacity(0.8),
              ]}
            >
              {status}
            </Text>
          ) : null}
        </HStack>
        <Spacer />
        <Text
          modifiers={[
            font({ design: 'rounded', size: isMedium ? 20 : 17, weight: 'semibold' }),
            foregroundStyle(fg),
            lineLimit(2),
          ]}
        >
          {routine.stepName}
        </Text>
        {timer}
        {progress}
        <HStack spacing={4}>
          {isMedium ? (
            <Text
              modifiers={[
                font({ design: 'rounded', size: 12, weight: 'medium' }),
                foregroundStyle(fg),
                opacity(0.75),
                lineLimit(1),
              ]}
            >
              {routine.nextStepName ? `Up next: ${routine.nextStepName}` : 'Last step'}
            </Text>
          ) : (
            <Text
              modifiers={[
                font({ design: 'rounded', size: 11, weight: 'medium' }),
                foregroundStyle(fg),
                opacity(0.75),
                lineLimit(1),
              ]}
            >
              {status}
            </Text>
          )}
        </HStack>
      </VStack>
    );
  }

  if (props.mode === 'activity') {
    return (
      <VStack alignment="leading" spacing={2} modifiers={root}>
        <Image systemName="play.fill" size={15} color={fg} />
        <Spacer />
        <Text
          modifiers={[
            font({ design: 'rounded', size: isMedium ? 20 : 17, weight: 'semibold' }),
            foregroundStyle(fg),
            lineLimit(2),
          ]}
        >
          {props.name}
        </Text>
        <Text
          date={new Date(props.startedAtMs)}
          dateStyle="timer"
          modifiers={[
            font({ design: 'rounded', size: isMedium ? 44 : 34, weight: 'bold' }),
            monospacedDigit(),
            lineLimit(1),
            minimumScaleFactor(0.6),
            foregroundStyle(fg),
          ]}
        />
      </VStack>
    );
  }

  return (
    <VStack alignment="leading" spacing={2} modifiers={root}>
      <Image systemName="play.circle" size={22} color={fg} modifiers={[opacity(0.7)]} />
      <Spacer />
      <Text
        modifiers={[font({ design: 'rounded', size: 17, weight: 'semibold' }), foregroundStyle(fg)]}
      >
        {props.name}
      </Text>
      <Text
        modifiers={[
          font({ design: 'rounded', size: 13, weight: 'medium' }),
          foregroundStyle(fg),
          opacity(0.7),
        ]}
      >
        {idleHint}
      </Text>
    </VStack>
  );
};

export const activeActivityWidget = createWidget<ActiveActivityWidgetProps>(
  'ActiveActivityWidget',
  ActiveActivityWidgetLayout
);
