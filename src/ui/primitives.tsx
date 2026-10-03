import { ReorderScrollView as RNScrollView } from './ReorderScrollView';
import type { ReactNode } from 'react';
import {
  Pressable,
  Text as RNText,
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useAppTheme } from '@theme';

/**
 * React Native layout primitives with the same API as Expo UI's universal
 * Column, Row, Text, and ScrollView. Layout stays in React Native on every
 * platform so screens render identically; native controls are hosted at the
 * leaves (see AppButton, AccessiblePicker, AppSlider).
 */
export type Alignment = 'start' | 'center' | 'end';

interface StackProps {
  children?: ReactNode;
  alignment?: Alignment;
  spacing?: number;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  disabled?: boolean;
  hidden?: boolean;
  testID?: string;
}

const styles = StyleSheet.create({
  column: { alignSelf: 'stretch', flexDirection: 'column' },
  row: { alignSelf: 'stretch', flexDirection: 'row' },
  hidden: { display: 'none' },
  disabled: { opacity: 0.5, pointerEvents: 'none' },
  start: { alignItems: 'flex-start' },
  center: { alignItems: 'center' },
  end: { alignItems: 'flex-end' },
  noGrow: { flexGrow: 0 },
});

function Stack({
  direction,
  children,
  alignment = 'start',
  spacing,
  style,
  onPress,
  disabled = false,
  hidden = false,
  testID,
}: StackProps & { direction: 'column' | 'row' }) {
  const stackStyle = [
    styles[direction],
    styles[alignment],
    spacing != null && { gap: spacing },
    style,
    hidden && styles.hidden,
    disabled && styles.disabled,
  ];
  if (onPress) {
    return (
      <Pressable disabled={disabled} onPress={onPress} style={stackStyle} testID={testID}>
        {children}
      </Pressable>
    );
  }
  return (
    <View style={stackStyle} testID={testID}>
      {children}
    </View>
  );
}

export type ColumnProps = StackProps;
export type RowProps = StackProps;

export function Column(props: ColumnProps) {
  return <Stack {...props} direction="column" />;
}

export function Row(props: RowProps) {
  return <Stack {...props} direction="row" />;
}

export type TextStyleProps = Pick<
  TextStyle,
  | 'color'
  | 'fontFamily'
  | 'fontSize'
  | 'fontVariant'
  | 'fontWeight'
  | 'letterSpacing'
  | 'lineHeight'
  | 'textAlign'
>;

export interface TextProps {
  children?: ReactNode;
  textStyle?: TextStyleProps;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  onPress?: () => void;
  disabled?: boolean;
  hidden?: boolean;
  testID?: string;
}

export function Text({
  children,
  textStyle,
  style,
  numberOfLines,
  onPress,
  disabled = false,
  hidden = false,
  testID,
}: TextProps) {
  const { colors } = useAppTheme();
  return (
    <RNText
      disabled={disabled}
      numberOfLines={numberOfLines}
      onPress={onPress}
      style={[
        { color: colors.text },
        style,
        textStyle,
        hidden && styles.hidden,
        disabled && styles.disabled,
      ]}
      testID={testID}
    >
      {children}
    </RNText>
  );
}

export interface ScrollViewProps {
  children?: ReactNode;
  direction?: 'vertical' | 'horizontal';
  showsIndicators?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  hidden?: boolean;
  contentInsetAdjustmentBehavior?: 'automatic' | 'never' | 'always' | 'scrollableAxes';
  testID?: string;
}

export function ScrollView({
  children,
  direction = 'vertical',
  showsIndicators = true,
  style,
  contentContainerStyle,
  contentInsetAdjustmentBehavior,
  hidden = false,
  testID,
}: ScrollViewProps) {
  const flatStyle = StyleSheet.flatten(style);
  return (
    <RNScrollView
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
      horizontal={direction === 'horizontal'}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      showsHorizontalScrollIndicator={showsIndicators}
      showsVerticalScrollIndicator={showsIndicators}
      style={[style, flatStyle?.height != null && styles.noGrow, hidden && styles.hidden]}
      testID={testID}
    >
      {children}
    </RNScrollView>
  );
}
