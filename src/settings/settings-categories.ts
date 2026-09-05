import type { IconName } from '@icons/icon-names';

export const settingsCategories = [
  { id: 'appearance', title: 'Appearance', icon: 'palette', path: '/settings/appearance' },
  {
    id: 'time-boundaries',
    title: 'Time boundaries',
    icon: 'clock',
    path: '/settings/time-boundaries',
  },
  {
    id: 'short-activity-filter',
    title: 'Short activity filter',
    icon: 'timer',
    path: '/settings/short-activity-filter',
  },
  {
    id: 'routine-alarm',
    title: 'Routine alarm',
    icon: 'alarm-clock',
    path: '/settings/routine-alarm',
  },
  {
    id: 'routine-defaults',
    title: 'Routine defaults',
    icon: 'repeat',
    path: '/settings/routine-defaults',
  },
  {
    id: 'catalog-visibility',
    title: 'Catalog visibility',
    icon: 'archive',
    path: '/settings/catalog-visibility',
  },
  {
    id: 'backup-restore',
    title: 'Backup & restore',
    icon: 'upload',
    path: '/settings/backup-restore',
  },
  {
    id: 'prototype-data',
    title: 'Prototype data',
    icon: 'trash-2',
    path: '/settings/prototype-data',
  },
] as const satisfies readonly {
  id: string;
  title: string;
  icon: IconName;
  path: string;
}[];

export type SettingsCategory = (typeof settingsCategories)[number];
export type SettingsCategoryId = SettingsCategory['id'];

export function getSettingsCategory(value: string | string[] | undefined): SettingsCategory | null {
  const id = Array.isArray(value) ? value[0] : value;
  return settingsCategories.find((category) => category.id === id) ?? null;
}
