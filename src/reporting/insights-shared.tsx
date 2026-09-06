import { Column, Row, Text } from '@expo/ui';
import type { ReactNode } from 'react';

import { formatDuration } from '@domain';
import { useAppTheme } from '@theme';
import { AppButton } from '@ui';

/** Shared building blocks for Insights and History. Bars always mean "% of the period total". */

export function SectionCard({
  children,
  title,
  subtitle,
  testID,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  testID?: string;
}) {
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
      <Column spacing={2}>
        <Text textStyle={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{title}</Text>
        {subtitle ? (
          <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>{subtitle}</Text>
        ) : null}
      </Column>
      {children}
    </Column>
  );
}

export function SegmentedOptions<T extends string>({
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  options: readonly { value: T; label: string; testID?: string }[];
  value: T;
  onChange: (next: T) => void;
  testIDPrefix: string;
}) {
  return (
    <Row alignment="center" spacing={8} style={{ width: '100%' }}>
      {options.map((option) => (
        <AppButton
          key={option.value}
          label={option.label}
          onPress={() => onChange(option.value)}
          style={{ height: 44, width: `${Math.floor(96 / options.length)}%` }}
          testID={option.testID ?? `${testIDPrefix}-${option.value}`}
          variant={value === option.value ? 'filled' : 'outlined'}
        />
      ))}
    </Row>
  );
}

export function ShareBar({
  name,
  durationMs,
  totalMs,
  color,
  meta,
  testID,
}: {
  name: string;
  durationMs: number;
  totalMs: number;
  color: string;
  meta?: string;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  const share = totalMs > 0 ? durationMs / totalMs : 0;
  return (
    <Column spacing={6} style={{ width: '100%' }} testID={testID}>
      <Row alignment="center" spacing={8} style={{ width: '100%' }}>
        <Text numberOfLines={1} textStyle={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
          {name}
        </Text>
      </Row>
      <Row alignment="center" spacing={8} style={{ width: '100%' }}>
        <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
          {`${formatDuration(durationMs)} · ${Math.round(share * 100)}% of total`}
        </Text>
      </Row>
      <Column
        style={{
          backgroundColor: colors.surfaceMuted,
          borderRadius: 99,
          height: 10,
          width: '100%',
        }}
      >
        <Column
          style={{
            backgroundColor: color,
            borderRadius: 99,
            height: 10,
            width: `${Math.max(share * 100, durationMs > 0 ? 4 : 0)}%`,
          }}
        />
      </Column>
      {meta ? <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>{meta}</Text> : null}
    </Column>
  );
}

export function SummaryHero({
  eyebrow,
  total,
  detail,
  footnote,
  testID,
}: {
  eyebrow: string;
  total: string;
  detail: string;
  footnote?: string;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <SectionCard testID={testID} title={eyebrow}>
      <Text textStyle={{ color: colors.text, fontSize: 36, fontWeight: '700' }}>{total}</Text>
      <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>{detail}</Text>
      {footnote ? (
        <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>{footnote}</Text>
      ) : null}
    </SectionCard>
  );
}

export function EmptyNote({ message }: { message: string }) {
  const { colors } = useAppTheme();
  return <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>{message}</Text>;
}
