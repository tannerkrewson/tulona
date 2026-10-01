import type { PickerItemValue } from '@expo/ui';
import { Children, Fragment, isValidElement, useState, type ReactNode } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, type IconValue } from '@icons';
import { useAppTheme } from '@theme';

import { AccessiblePicker } from './AccessiblePicker';
import { AccessibleTextInput } from './AccessibleTextInput';
import { ColorPicker } from './ColorPicker';
import { IconPicker } from './IconPicker';
import { getRowSurfaceBackground } from './row-surface';

const ROW_MIN_HEIGHT = 50;
const ROW_PADDING = 16;
const SYSTEM_RED = { light: '#FF3B30', dark: '#FF453A' } as const;

function useFormColors() {
  const { colorScheme, colors } = useAppTheme();
  return {
    colors,
    colorScheme,
    destructive: SYSTEM_RED[colorScheme],
    group: getRowSurfaceBackground({
      colorScheme,
      surface: colors.surface,
      surfaceMuted: colors.surfaceMuted,
    }),
  };
}

/** Vertical rhythm for a stack of grouped sections. */
export function Form({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View style={styles.form} testID={testID}>
      {children}
    </View>
  );
}

export interface FormSectionProps {
  title?: string;
  /** Trailing control in the section header, such as an Edit toggle. */
  headerAction?: ReactNode;
  footer?: string;
  children: ReactNode;
  testID?: string;
}

/** An inset grouped list section: optional header, rows with hairline separators, and footer. */
export function FormSection({ title, headerAction, footer, children, testID }: FormSectionProps) {
  const { colors, group } = useFormColors();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={styles.section} testID={testID}>
      {title || headerAction ? (
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
          {headerAction}
        </View>
      ) : null}
      {rows.length > 0 ? (
        <View style={[styles.group, { backgroundColor: group }]}>
          {rows.map((row, index) => (
            <Fragment key={row.key ?? index}>
              {index > 0 ? (
                <View style={[styles.separator, { backgroundColor: colors.border }]} />
              ) : null}
              {row}
            </Fragment>
          ))}
        </View>
      ) : null}
      {footer ? (
        <Text style={[styles.sectionFooter, { color: colors.textMuted }]}>{footer}</Text>
      ) : null}
    </View>
  );
}

export interface FormRowProps {
  label: string;
  subtitle?: string;
  value?: string;
  icon?: IconValue;
  iconColor?: string;
  /** Custom leading content, such as a color swatch, in place of an icon. */
  leading?: ReactNode;
  /** Replaces the value text with custom trailing content. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** Navigation rows show a chevron; action rows tint their label instead. */
  kind?: 'navigation' | 'action' | 'destructive';
  disabled?: boolean;
  muted?: boolean;
  accessibilityHint?: string;
  accessibilityLabel?: string;
  testID?: string;
}

export function FormRow({
  label,
  subtitle,
  value,
  icon,
  iconColor,
  leading,
  trailing,
  onPress,
  kind = 'navigation',
  disabled = false,
  muted = false,
  accessibilityHint,
  accessibilityLabel,
  testID,
}: FormRowProps) {
  const { colors, destructive } = useFormColors();
  const labelColor =
    kind === 'destructive'
      ? destructive
      : kind === 'action'
        ? colors.primary
        : muted
          ? colors.textMuted
          : colors.text;
  const content = (
    <>
      {leading ? <View style={styles.rowIcon}>{leading}</View> : null}
      {icon ? (
        <View style={styles.rowIcon}>
          <AppIcon
            color={iconColor ?? (kind === 'navigation' ? colors.text : labelColor)}
            name={icon}
            size={21}
          />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <Text
          numberOfLines={1}
          style={[
            styles.rowLabel,
            { color: labelColor },
            kind !== 'navigation' && styles.rowActionLabel,
          ]}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} style={[styles.rowSubtitle, { color: colors.textMuted }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ??
        (value ? (
          <Text numberOfLines={1} style={[styles.rowValue, { color: colors.textMuted }]}>
            {value}
          </Text>
        ) : null)}
      {onPress && kind === 'navigation' ? (
        <AppIcon color={colors.textMuted} name="chevron-right" size={18} strokeWidth={2.4} />
      ) : null}
    </>
  );
  if (!onPress) {
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        style={[styles.row, disabled && styles.disabled]}
        testID={testID}
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? (value ? `${label}, ${value}` : label)}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.border },
        disabled && styles.disabled,
      ]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

export interface FormTextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  autoFocus?: boolean;
  testID?: string;
}

/** A borderless text field that fills its row, like a Settings or Reminders form. */
export function FormTextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  autoFocus = false,
  testID,
}: FormTextFieldProps) {
  const { colors } = useFormColors();
  return (
    <AccessibleTextInput
      autoFocus={autoFocus}
      defaultValue={value}
      label={label}
      multiline={multiline}
      numberOfLines={multiline ? 4 : undefined}
      onChangeText={onChangeText}
      placeholder={placeholder}
      returnKeyType={multiline ? 'default' : 'done'}
      style={{
        backgroundColor: 'transparent',
        borderRadius: 0,
        borderWidth: 0,
        height: multiline ? undefined : ROW_MIN_HEIGHT,
        paddingHorizontal: ROW_PADDING,
      }}
      testID={testID}
      textStyle={{ color: colors.text, fontSize: 17 }}
    />
  );
}

export interface FormSwitchRowProps {
  label: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

export function FormSwitchRow({
  label,
  subtitle,
  value,
  onValueChange,
  disabled = false,
  testID,
}: FormSwitchRowProps) {
  return (
    <FormRow
      accessibilityLabel={label}
      disabled={disabled}
      label={label}
      subtitle={subtitle}
      trailing={
        <Switch disabled={disabled} onValueChange={onValueChange} testID={testID} value={value} />
      }
    />
  );
}

export interface FormPickerRowProps<T extends PickerItemValue> {
  label: string;
  selectedValue: T;
  onValueChange: (value: T) => void;
  enabled?: boolean;
  icon?: IconValue;
  iconColor?: string;
  children: ReactNode;
  testID?: string;
}

/** A labelled row whose value opens the system menu picker. */
export function FormPickerRow<T extends PickerItemValue>({
  label,
  selectedValue,
  onValueChange,
  enabled = true,
  icon,
  iconColor,
  children,
  testID,
}: FormPickerRowProps<T>) {
  const { colors } = useFormColors();
  return (
    <View style={[styles.row, styles.pickerRow]}>
      {icon ? (
        <View style={styles.rowIcon}>
          <AppIcon color={iconColor ?? colors.text} name={icon} size={21} />
        </View>
      ) : null}
      <Text numberOfLines={1} style={[styles.rowLabel, styles.pickerLabel, { color: colors.text }]}>
        {label}
      </Text>
      <AccessiblePicker
        enabled={enabled}
        inline
        label={label}
        onValueChange={onValueChange}
        selectedValue={selectedValue}
        testID={testID}
      >
        {children}
      </AccessiblePicker>
    </View>
  );
}

/** Wraps non-row content, such as a picker grid, with the row's padding. */
export function FormContent({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View style={styles.content} testID={testID}>
      {children}
    </View>
  );
}

export function ColorDot({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <View style={{ backgroundColor: color, borderRadius: size / 2, height: size, width: size }} />
  );
}

/** A Color row that shows the current swatch and picks a new one in a sheet. */
export function FormColorRow({
  label = 'Color',
  value,
  onChange,
  emptyLabel = 'Default',
  testID,
}: {
  label?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  emptyLabel?: string;
  testID?: string;
}) {
  const { colors } = useFormColors();
  const [open, setOpen] = useState(false);
  return (
    <>
      <FormRow
        accessibilityLabel={`${label}, ${value ?? emptyLabel}`}
        label={label}
        onPress={() => setOpen(true)}
        testID={testID ? `${testID}-row` : undefined}
        trailing={
          value ? (
            <View style={[styles.swatch, { backgroundColor: value }]} />
          ) : (
            <Text style={[styles.rowValue, { color: colors.textMuted }]}>{emptyLabel}</Text>
          )
        }
      />
      <FormSheet onClose={() => setOpen(false)} title={label} visible={open}>
        <FormSection>
          <FormContent>
            <ColorPicker onChange={onChange} testID={testID} value={value} />
          </FormContent>
        </FormSection>
      </FormSheet>
    </>
  );
}

/** An Icon row that previews the current icon and picks a new one in a sheet. */
export function FormIconRow({
  label = 'Icon',
  value,
  onChange,
  color,
  filled = false,
  testID,
}: {
  label?: string;
  value: IconValue | null;
  onChange: (value: IconValue | null) => void;
  color?: string;
  /** Matches solid catalog icons, such as folders. */
  filled?: boolean;
  testID?: string;
}) {
  const { colors } = useFormColors();
  const [open, setOpen] = useState(false);
  return (
    <>
      <FormRow
        accessibilityLabel={`${label}, ${value ?? 'None'}`}
        label={label}
        onPress={() => setOpen(true)}
        testID={testID ? `${testID}-row` : undefined}
        trailing={
          value ? (
            <AppIcon
              color={color ?? colors.text}
              fill={filled ? (color ?? colors.text) : undefined}
              name={value}
              size={22}
              strokeWidth={filled ? 0 : undefined}
            />
          ) : (
            <Text style={[styles.rowValue, { color: colors.textMuted }]}>None</Text>
          )
        }
      />
      <FormSheet onClose={() => setOpen(false)} title={label} visible={open}>
        <IconPicker expanded onChange={onChange} testID={testID} value={value} />
      </FormSheet>
    </>
  );
}

export function HeaderTextButton({
  label,
  onPress,
  disabled = false,
  emphasized = false,
  compact = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  emphasized?: boolean;
  /** Sized for section headers rather than navigation bars. */
  compact?: boolean;
  testID?: string;
}) {
  const { colors } = useFormColors();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        compact ? null : styles.headerButton,
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.6 },
      ]}
      testID={testID}
    >
      <Text
        style={{
          color: colors.primary,
          fontSize: compact ? 15 : 17,
          fontWeight: emphasized ? '700' : compact ? '500' : '400',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export interface FormSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** When set, the sheet shows Cancel and a confirming action; otherwise a single Done. */
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  children: ReactNode;
  testID?: string;
}

/** A system page sheet with a compact navigation bar for focused sub-forms. */
export function FormSheet({
  visible,
  title,
  onClose,
  onConfirm,
  confirmLabel = 'Save',
  confirmDisabled = false,
  children,
  testID,
}: FormSheetProps) {
  const { colors } = useFormColors();
  const insets = useSafeAreaInsets();
  const pageSheet = Platform.OS === 'ios';
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle={pageSheet ? 'pageSheet' : 'fullScreen'}
      visible={visible}
    >
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.background, paddingTop: pageSheet ? 0 : insets.top },
        ]}
        testID={testID}
      >
        <View style={styles.sheetBar}>
          <View style={[styles.sheetBarSide, { alignItems: 'flex-start' }]}>
            {onConfirm ? (
              <HeaderTextButton
                label="Cancel"
                onPress={onClose}
                testID={testID ? `${testID}-cancel` : undefined}
              />
            ) : null}
          </View>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={[styles.sheetTitle, { color: colors.text }]}
          >
            {title}
          </Text>
          <View style={[styles.sheetBarSide, { alignItems: 'flex-end' }]}>
            <HeaderTextButton
              disabled={confirmDisabled}
              emphasized
              label={onConfirm ? confirmLabel : 'Done'}
              onPress={onConfirm ?? onClose}
              testID={testID ? `${testID}-confirm` : undefined}
            />
          </View>
        </View>
        <ScrollView
          contentContainerStyle={[
            styles.sheetContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 24 },
          ]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  form: { gap: 28, width: '100%' },
  section: { gap: 7, width: '100%' },
  sectionHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 20,
    paddingHorizontal: ROW_PADDING,
  },
  sectionTitle: { fontSize: 13, fontWeight: '500', textTransform: 'uppercase' },
  sectionFooter: { fontSize: 13, lineHeight: 18, paddingHorizontal: ROW_PADDING },
  group: { borderCurve: 'continuous', borderRadius: 14, overflow: 'hidden', width: '100%' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: ROW_PADDING },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: ROW_MIN_HEIGHT,
    paddingHorizontal: ROW_PADDING,
    paddingVertical: 8,
    width: '100%',
  },
  pickerRow: { paddingRight: 8, paddingVertical: 0 },
  rowIcon: { alignItems: 'center', justifyContent: 'center', width: 26 },
  rowText: { flex: 1, gap: 2, minWidth: 0 },
  rowLabel: { fontSize: 17 },
  rowActionLabel: { fontWeight: '500' },
  rowSubtitle: { fontSize: 13, lineHeight: 18 },
  rowValue: { flexShrink: 1, fontSize: 17, maxWidth: '55%', textAlign: 'right' },
  pickerLabel: { flexShrink: 0, maxWidth: '50%' },
  disabled: { opacity: 0.45 },
  swatch: { borderRadius: 11, height: 22, width: 22 },
  content: { padding: ROW_PADDING, width: '100%' },
  headerButton: { justifyContent: 'center', minHeight: 44, minWidth: 44 },
  sheet: { flex: 1 },
  sheetBar: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 56,
    paddingHorizontal: 16,
  },
  sheetBarSide: { flex: 1 },
  sheetTitle: { flex: 2, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  sheetContent: { gap: 28, paddingHorizontal: 16, paddingTop: 8 },
});
