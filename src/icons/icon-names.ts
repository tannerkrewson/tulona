export const iconNames = [
  'activity',
  'bar-chart-3',
  'check',
  'check-circle-2',
  'circle',
  'clock',
  'folder',
  'heart',
  'list-checks',
  'pause',
  'play',
  'repeat',
  'settings',
  'skip-forward',
  'timer',
  'upload',
] as const;

export type IconName = (typeof iconNames)[number];

export interface IconMetadata {
  readonly name: IconName;
  readonly label: string;
  readonly keywords: readonly string[];
}

export const iconCatalog: readonly IconMetadata[] = [
  { name: 'activity', label: 'Activity', keywords: ['tracking', 'pulse'] },
  { name: 'bar-chart-3', label: 'Insights', keywords: ['report', 'chart', 'analytics'] },
  { name: 'check', label: 'Complete', keywords: ['done', 'finished'] },
  { name: 'check-circle-2', label: 'Completed', keywords: ['done', 'finished', 'success'] },
  { name: 'circle', label: 'Inactive', keywords: ['empty', 'not active'] },
  { name: 'clock', label: 'History', keywords: ['time', 'recent'] },
  { name: 'folder', label: 'Folder', keywords: ['collection', 'group'] },
  { name: 'heart', label: 'Habit', keywords: ['favorite', 'wellbeing'] },
  { name: 'list-checks', label: 'Steps', keywords: ['tasks', 'checklist'] },
  { name: 'pause', label: 'Pause', keywords: ['stop', 'hold'] },
  { name: 'play', label: 'Start', keywords: ['begin', 'run'] },
  { name: 'repeat', label: 'Routine', keywords: ['sequence', 'recurring'] },
  { name: 'settings', label: 'Settings', keywords: ['preferences', 'configuration'] },
  { name: 'skip-forward', label: 'Skip', keywords: ['next', 'advance'] },
  { name: 'timer', label: 'Timer', keywords: ['duration', 'countdown'] },
  { name: 'upload', label: 'Backup', keywords: ['export', 'restore'] },
];

export function getIconMetadata(name: IconName): IconMetadata {
  return iconCatalog.find((icon) => icon.name === name) ?? iconCatalog[0];
}
