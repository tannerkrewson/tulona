import type { IconName } from '@icons/icon-names';

export const settingsCategories = [
  { id: 'appearance', title: 'Appearance', icon: 'palette', path: '/settings/appearance' },
  {
    id: 'time-and-activity',
    title: 'Time & activity',
    icon: 'clock',
    path: '/settings/time-and-activity',
  },
  {
    id: 'routines',
    title: 'Routines',
    icon: 'repeat',
    path: '/settings/routines',
  },
  {
    id: 'catalog',
    title: 'Catalog',
    icon: 'archive',
    path: '/settings/catalog',
  },
  {
    id: 'data',
    title: 'Data',
    icon: 'upload',
    path: '/settings/data',
  },
] as const satisfies readonly {
  id: string;
  title: string;
  icon: IconName;
  path: string;
}[];

export type SettingsCategory = (typeof settingsCategories)[number];
export type SettingsCategoryId = SettingsCategory['id'];

const legacyCategoryIds: Readonly<Record<string, SettingsCategoryId>> = {
  'time-boundaries': 'time-and-activity',
  'short-activity-filter': 'time-and-activity',
  'routine-alarm': 'routines',
  'routine-defaults': 'routines',
  'catalog-visibility': 'catalog',
  'backup-restore': 'data',
  'prototype-data': 'data',
};

export function getSettingsCategory(value: string | string[] | undefined): SettingsCategory | null {
  const id = Array.isArray(value) ? value[0] : value;
  const canonicalId = legacyCategoryIds[id ?? ''] ?? id;
  return settingsCategories.find((category) => category.id === canonicalId) ?? null;
}
