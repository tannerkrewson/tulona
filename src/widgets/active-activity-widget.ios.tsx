import { Circle, HStack, Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  cornerRadius,
  font,
  foregroundStyle,
  frame,
  monospacedDigit,
  opacity,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type {
  ActiveActivityWidgetProps,
  ActiveActivityWidgetSyncInput,
} from './active-activity-widget-shared';
import { activeActivityWidgetProps } from './active-activity-widget-shared';

const ActiveActivityWidgetLayout = (
  props: ActiveActivityWidgetProps,
  environment: WidgetEnvironment
) => {
  'widget';

  const isSmall = environment.widgetFamily === 'systemSmall';
  const titleSize = isSmall ? 15 : 17;
  const title = props.active ? props.name : 'No active activity';

  return (
    <VStack
      alignment="leading"
      spacing={10}
      modifiers={[
        frame({ maxWidth: 1000, maxHeight: 1000, alignment: 'topLeading' }),
        padding({ all: 16 }),
        background(props.color),
        cornerRadius(22),
      ]}
    >
      <HStack alignment="center" spacing={7}>
        <Circle
          modifiers={[frame({ width: 10, height: 10 }), foregroundStyle(props.foregroundColor)]}
        />
        <Text
          modifiers={[
            font({ design: 'rounded', size: titleSize, weight: 'semibold' }),
            foregroundStyle(props.foregroundColor),
          ]}
        >
          {title}
        </Text>
      </HStack>
      {props.active ? (
        <Text
          date={new Date(props.startedAtMs)}
          dateStyle="timer"
          modifiers={[
            font({ design: 'monospaced', size: 31, weight: 'bold' }),
            monospacedDigit(),
            foregroundStyle(props.foregroundColor),
          ]}
        />
      ) : (
        <Text
          modifiers={[
            font({ design: 'rounded', size: 17, weight: 'medium' }),
            foregroundStyle(props.foregroundColor),
          ]}
        >
          Start an activity
        </Text>
      )}
      <Text
        modifiers={[
          font({ design: 'rounded', size: 10, weight: 'bold' }),
          foregroundStyle(props.foregroundColor),
          opacity(0.68),
        ]}
      >
        TULONA
      </Text>
    </VStack>
  );
};

export const activeActivityWidget = createWidget<ActiveActivityWidgetProps>(
  'ActiveActivityWidget',
  ActiveActivityWidgetLayout
);

export function syncActiveActivityWidget(input: ActiveActivityWidgetSyncInput): void {
  activeActivityWidget.updateSnapshot(activeActivityWidgetProps(input));
}
