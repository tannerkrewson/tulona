export interface IconMetadata {
  readonly name: IconName;
  readonly label: string;
  readonly keywords: readonly string[];
}

// Keep this list data-only so records can persist stable names instead of SVG
// components or platform-specific rendering details.
const iconDefinitions = [
  { name: 'activity', label: 'Activity', keywords: ['tracking', 'pulse', 'movement'] },
  { name: 'alarm-clock', label: 'Alarm', keywords: ['reminder', 'notification', 'time'] },
  { name: 'archive', label: 'Archive', keywords: ['stored', 'past', 'hidden'] },
  { name: 'award', label: 'Award', keywords: ['goal', 'achievement', 'success'] },
  { name: 'bar-chart-3', label: 'Insights', keywords: ['report', 'chart', 'analytics'] },
  { name: 'book-open', label: 'Reading', keywords: ['book', 'study', 'learning'] },
  { name: 'brain', label: 'Focus', keywords: ['thinking', 'mind', 'meditation'] },
  { name: 'briefcase', label: 'Work', keywords: ['office', 'job', 'work'] },
  { name: 'calendar-days', label: 'Calendar', keywords: ['date', 'schedule', 'day'] },
  { name: 'camera', label: 'Camera', keywords: ['photo', 'picture', 'creative'] },
  { name: 'car', label: 'Driving', keywords: ['travel', 'commute', 'transport'] },
  { name: 'check', label: 'Complete', keywords: ['done', 'finished'] },
  { name: 'check-circle-2', label: 'Completed', keywords: ['done', 'finished', 'success'] },
  { name: 'chevron-down', label: 'Down', keywords: ['lower', 'collapse', 'reorder'] },
  { name: 'chevron-up', label: 'Up', keywords: ['raise', 'expand', 'reorder'] },
  { name: 'circle', label: 'Inactive', keywords: ['empty', 'not active'] },
  { name: 'circle-dot', label: 'Current', keywords: ['selected', 'target', 'focus'] },
  { name: 'clock', label: 'History', keywords: ['time', 'recent', 'duration'] },
  { name: 'coffee', label: 'Break', keywords: ['rest', 'drink', 'morning'] },
  { name: 'dumbbell', label: 'Exercise', keywords: ['fitness', 'workout', 'strength'] },
  { name: 'flame', label: 'Streak', keywords: ['habit', 'hot', 'consistency'] },
  { name: 'folder', label: 'Folder', keywords: ['collection', 'group', 'category'] },
  { name: 'gamepad-2', label: 'Games', keywords: ['play', 'leisure', 'gaming'] },
  { name: 'graduation-cap', label: 'Learning', keywords: ['school', 'course', 'study'] },
  { name: 'headphones', label: 'Listening', keywords: ['audio', 'music', 'podcast'] },
  { name: 'heart', label: 'Habit', keywords: ['favorite', 'wellbeing', 'care'] },
  { name: 'house', label: 'Home', keywords: ['household', 'chores', 'personal'] },
  { name: 'inbox', label: 'Inbox', keywords: ['empty', 'new', 'collection'] },
  { name: 'laptop', label: 'Computer', keywords: ['screen', 'technology', 'work'] },
  { name: 'leaf', label: 'Nature', keywords: ['outside', 'garden', 'wellbeing'] },
  { name: 'lightbulb', label: 'Idea', keywords: ['creative', 'inspiration', 'thought'] },
  { name: 'list-checks', label: 'Steps', keywords: ['tasks', 'checklist', 'routine'] },
  { name: 'medal', label: 'Milestone', keywords: ['goal', 'achievement', 'reward'] },
  { name: 'message-circle', label: 'Conversation', keywords: ['talk', 'communication', 'social'] },
  { name: 'moon', label: 'Sleep', keywords: ['night', 'rest', 'bedtime'] },
  { name: 'music', label: 'Music', keywords: ['audio', 'song', 'playlist'] },
  { name: 'palette', label: 'Creative', keywords: ['art', 'design', 'color'] },
  { name: 'pencil', label: 'Writing', keywords: ['edit', 'note', 'journal'] },
  { name: 'phone', label: 'Phone', keywords: ['call', 'mobile', 'communication'] },
  { name: 'plane', label: 'Travel', keywords: ['trip', 'flight', 'vacation'] },
  { name: 'pause', label: 'Pause', keywords: ['stop', 'hold'] },
  { name: 'play', label: 'Start', keywords: ['begin', 'run', 'start'] },
  { name: 'repeat', label: 'Routine', keywords: ['sequence', 'recurring', 'habit'] },
  { name: 'settings', label: 'Settings', keywords: ['preferences', 'configuration'] },
  { name: 'shopping-bag', label: 'Shopping', keywords: ['errands', 'store', 'supplies'] },
  { name: 'shower-head', label: 'Shower', keywords: ['hygiene', 'morning', 'self-care'] },
  { name: 'skip-forward', label: 'Skip', keywords: ['next', 'advance'] },
  { name: 'smile', label: 'Wellbeing', keywords: ['mood', 'happy', 'care'] },
  { name: 'sparkles', label: 'Special', keywords: ['new', 'important', 'highlight'] },
  { name: 'sun', label: 'Morning', keywords: ['day', 'light', 'outside'] },
  { name: 'timer', label: 'Timer', keywords: ['duration', 'countdown', 'focus'] },
  { name: 'trash-2', label: 'Discard', keywords: ['delete', 'remove'] },
  { name: 'utensils', label: 'Meal', keywords: ['food', 'cooking', 'dinner'] },
  { name: 'upload', label: 'Backup', keywords: ['export', 'restore'] },
  { name: 'wallet', label: 'Finance', keywords: ['money', 'budget', 'errands'] },
  { name: 'watch', label: 'Timepiece', keywords: ['time', 'wearable', 'duration'] },
  { name: 'zap', label: 'Energy', keywords: ['quick', 'power', 'focus'] },
] as const;

export type IconName = (typeof iconDefinitions)[number]['name'];

export const iconNames: readonly IconName[] = iconDefinitions.map(({ name }) => name);
export const iconCatalog: readonly IconMetadata[] = iconDefinitions;

export function isIconName(value: unknown): value is IconName {
  return typeof value === 'string' && iconNames.includes(value as IconName);
}

/** Returns null for values read from records that are not in the curated set. */
export function parseIconName(value: unknown): IconName | null {
  return isIconName(value) ? value : null;
}

/** Resolves an optional persisted value to a safe icon for rendering. */
export function normalizeIconName(value: unknown, fallback: IconName = 'activity'): IconName {
  return isIconName(value) ? value : fallback;
}

export function getIconMetadata(name: unknown): IconMetadata {
  return iconCatalog.find((icon) => icon.name === name) ?? iconCatalog[0];
}
