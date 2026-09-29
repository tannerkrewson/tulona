import { Host } from '@expo/ui';
import { useIsFocused, useRouter, type Href } from 'expo-router';
import { Pressable, Text as NativeText, View } from 'react-native';
import { useCallback, useEffect, useState } from 'react';

import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';
import {
  errorText,
  getRowSurfaceLayoutStyle,
  getRowSurfaceStyle,
  ROW_SURFACE_CONTENT_GAP,
  ROW_SURFACE_DIVIDER_WIDTH,
  Screen,
} from '@ui';
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
        borderBottomWidth: isLast ? 0 : ROW_SURFACE_DIVIDER_WIDTH,
        opacity: pressed ? 0.78 : 1,
        width: '100%',
      })}
      testID={`settings-category-${category.id}`}
    >
      <View
        style={{
          ...getRowSurfaceLayoutStyle(),
          gap: ROW_SURFACE_CONTENT_GAP,
        }}
      >
        <View
          style={{
            alignItems: 'center',
            backgroundColor: colors.surfaceMuted,
            borderRadius: 9,
            height: 34,
            justifyContent: 'center',
            width: 34,
          }}
        >
          <AppIcon color={colors.text} name={category.icon} size={19} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <NativeText
            numberOfLines={1}
            style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}
          >
            {category.title}
          </NativeText>
        </View>
        <View
          style={{
            alignItems: 'center',
            alignSelf: 'stretch',
            justifyContent: 'center',
            width: 24,
          }}
        >
          <AppIcon color={colors.textMuted} name="chevron-right" size={20} strokeWidth={2.4} />
        </View>
      </View>
    </Pressable>
  );
}

function SettingsCategoryList({ router }: { router: ReturnType<typeof useRouter> }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        ...getRowSurfaceStyle({ backgroundColor: colors.surface }),
        overflow: 'hidden',
        width: '100%',
      }}
      testID="settings-category-list"
    >
      <View style={{ width: '100%' }}>
        {settingsCategories.map((category, index) => (
          <SettingsCategoryRow
            category={category}
            isLast={index === settingsCategories.length - 1}
            key={category.id}
            onPress={() => router.push(category.path as Href)}
          />
        ))}
      </View>
    </View>
  );
}

function SettingsActionErrorHost({ onBack, store }: { onBack: () => void; store: SettingsStore }) {
  const error = store((state) => state.persistenceError);
  if (!error) return null;

  return (
    <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
      <SettingsActionError onBack={onBack} store={store} />
    </Host>
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
    <Screen hostContent={false} title="Settings">
      <View style={{ gap: 16, width: '100%' }}>
        {store ? (
          <SettingsActionErrorHost onBack={() => router.replace('/')} store={store} />
        ) : null}
        {!store ? (
          <View style={{ gap: 12, width: '100%' }}>
            <NativeText style={{ color: loadError ? colors.text : colors.textMuted, fontSize: 15 }}>
              {loadError ?? 'Loading settings...'}
            </NativeText>
            {loadError ? (
              <RecoveryActions
                onRetry={load}
                onClose={() => router.replace('/')}
                retryTestID="settings-retry"
                testID="settings-load-recovery"
              />
            ) : null}
          </View>
        ) : null}
        <SettingsCategoryList router={router} />
      </View>
    </Screen>
  );
}
