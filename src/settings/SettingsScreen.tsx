import { Column, Row, Text } from '@expo/ui';
import { useIsFocused, useRouter, type Href } from 'expo-router';
import { Pressable } from 'react-native';
import { useCallback, useEffect, useState } from 'react';

import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';
import { errorText, Screen } from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';

import { settingsCategories } from './settings-categories';
import { SettingsActionError } from './SettingsFeedback';
import { loadSettingsStore } from './settings-runtime';
import type { SettingsStore } from './settings-store';

function SettingsCategoryRow({
  category,
  isLast,
  onPress,
}: {
  category: (typeof settingsCategories)[number];
  isLast: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityHint={`Opens ${category.title} settings`}
      accessibilityLabel={category.title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
        borderBottomColor: colors.border,
        borderBottomWidth: isLast ? 0 : 1,
        minHeight: 66,
        opacity: pressed ? 0.78 : 1,
        paddingHorizontal: 16,
        width: '100%',
      })}
      testID={`settings-category-${category.id}`}
    >
      <Row alignment="center" spacing={12} style={{ height: 66, width: '100%' }}>
        <Column
          alignment="center"
          style={{
            backgroundColor: colors.surfaceMuted,
            borderRadius: 9,
            height: 34,
            width: 34,
          }}
        >
          <AppIcon color={colors.text} name={category.icon} size={19} strokeWidth={2.2} />
        </Column>
        <Text numberOfLines={1} textStyle={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>
          {category.title}
        </Text>
        <AppIcon color={colors.textMuted} name="chevron-right" size={20} strokeWidth={2.4} />
      </Row>
    </Pressable>
  );
}

function SettingsCategoryList({ router }: { router: ReturnType<typeof useRouter> }) {
  const { colors } = useAppTheme();
  return (
    <Column
      style={{
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        width: '100%',
      }}
      testID="settings-category-list"
    >
      {settingsCategories.map((category, index) => (
        <SettingsCategoryRow
          category={category}
          isLast={index === settingsCategories.length - 1}
          key={category.id}
          onPress={() => router.push(category.path as Href)}
        />
      ))}
    </Column>
  );
}

export default function SettingsScreen() {
  const { colors } = useAppTheme();
  const focused = useIsFocused();
  const router = useRouter();
  const [store, setStore] = useState<SettingsStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    void loadSettingsStore()
      .then((nextStore) => setStore(() => nextStore))
      .catch((error: unknown) => setLoadError(errorText(error)));
  }, []);

  useEffect(() => {
    if (focused) void Promise.resolve().then(load);
  }, [focused, load]);

  return (
    <Screen title="Settings">
      <Column spacing={16} style={{ width: '100%' }}>
        {store ? (
          <SettingsActionError onBack={() => router.replace('/(tabs)')} store={store} />
        ) : null}
        {!store ? (
          <Column spacing={12} style={{ width: '100%' }}>
            <Text
              textStyle={{
                color: loadError ? colors.text : colors.textMuted,
                fontSize: 15,
              }}
            >
              {loadError ?? 'Loading settings...'}
            </Text>
            {loadError ? (
              <RecoveryActions
                onRetry={load}
                onBack={() => router.replace('/(tabs)')}
                retryTestID="settings-retry"
                testID="settings-load-recovery"
              />
            ) : null}
          </Column>
        ) : null}
        <SettingsCategoryList router={router} />
      </Column>
    </Screen>
  );
}
