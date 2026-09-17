import {
  getRowSurfaceLayoutStyle,
  getRowSurfaceStyle,
  ROW_SURFACE_BORDER_WIDTH,
  ROW_SURFACE_CONTENT_GAP,
  ROW_SURFACE_DIVIDER_WIDTH,
  ROW_SURFACE_HEIGHT,
  ROW_SURFACE_ICON_SIZE,
  ROW_SURFACE_LIST_GAP,
  ROW_SURFACE_PADDING_HORIZONTAL,
  ROW_SURFACE_RADIUS,
  ROW_SURFACE_SHADOW,
} from '../src/ui/row-surface';

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const appScreen = read('src/ui/AppScreen.tsx');
const activityRow = read('src/tracker/ActivityRow.tsx');
const folderRow = read('src/tracker/FolderRow.tsx');
const habitList = read('src/habits/HabitListScreen.tsx');
const settingsScreen = read('src/settings/SettingsScreen.tsx');
const emptyState = read('src/ui/EmptyState.tsx');
const activitiesScreen = read('src/tracker/ActivitiesScreen.tsx');
const folderDetail = read('src/tracker/FolderDetailScreen.tsx');
const chooser = read('src/routine/NextActivityChooserScreen.tsx');
const activityChooser = read('src/tracker/ActivitySessionActivityChooserScreen.tsx');
const habitItemStart = habitList.indexOf('function HabitListItem(');
const habitItemEnd = habitList.indexOf('function HabitAction(', habitItemStart);
const habitItem = habitList.slice(habitItemStart, habitItemEnd);

const compactRow = {
  ...getRowSurfaceStyle({ backgroundColor: '#FFFFFF' }),
  ...getRowSurfaceLayoutStyle(),
};

assert(
  compactRow.height === ROW_SURFACE_HEIGHT &&
    compactRow.paddingHorizontal === ROW_SURFACE_PADDING_HORIZONTAL &&
    compactRow.borderRadius === ROW_SURFACE_RADIUS &&
    compactRow.borderWidth === ROW_SURFACE_BORDER_WIDTH &&
    ROW_SURFACE_BORDER_WIDTH === 0 &&
    compactRow.boxShadow === ROW_SURFACE_SHADOW.boxShadow &&
    compactRow.elevation === ROW_SURFACE_SHADOW.elevation,
  'compact rows must share one height, inset, radius, borderless treatment, and shadow'
);
assert(
  ROW_SURFACE_CONTENT_GAP === ROW_SURFACE_PADDING_HORIZONTAL && ROW_SURFACE_ICON_SIZE === 40,
  'compact row content geometry must remain aligned'
);
assert(
  activityRow.includes('getRowSurfaceStyle') &&
    activityRow.includes('getRowSurfaceLayoutStyle()') &&
    folderRow.includes('getRowSurfaceStyle') &&
    folderRow.includes('getRowSurfaceLayoutStyle()'),
  'activity and folder rows must use the shared surface and layout tokens'
);
assert(
  activitiesScreen.includes('<FolderRow') &&
    activitiesScreen.includes('<ActivityRow') &&
    folderDetail.includes('<ActivityRow') &&
    chooser.includes('<FolderRow') &&
    chooser.includes('<ActivityRow'),
  'catalog, folder, and chooser surfaces must all consume the shared row components'
);
assert(
  folderRow.includes("colorScheme === 'dark' ? colors.surfaceMuted : colors.surface") &&
    folderRow.includes('variant="filled"') &&
    !folderRow.includes('variant="outlined"') &&
    !folderRow.includes('borderColor: colors.border') &&
    !folderRow.includes('borderWidth: 0'),
  'folder rows must use the same filled, borderless surface treatment as activities'
);
assert(
  activityRow.includes('active ? accent : inactiveBackground') &&
    activityRow.includes('active ? activeForeground : colors.text') &&
    activityRow.includes('fill={solidIcon') &&
    activityRow.includes('strokeWidth={solidIcon ? 0 : 2.5}'),
  'activity active-state color semantics must remain intact'
);
assert(
  activityRow.includes('variant="filled"') &&
    !activityRow.includes('borderColor:') &&
    !activityRow.includes('borderWidth:'),
  'activity rows must delegate their borderless treatment to the shared surface primitive'
);
assert(
  habitItem.includes('getRowSurfaceStyle') &&
    habitItem.includes('backgroundColor: colors.surface') &&
    !habitItem.includes('borderColor:') &&
    !habitItem.includes('borderWidth:') &&
    !habitItem.includes('colors.success.background') &&
    !habitItem.includes('colors.warning.background') &&
    !habitItem.includes('colors.danger.background'),
  'habit rows must delegate one borderless surface without state background colors'
);
assert(
  activitiesScreen.includes('spacing={ROW_SURFACE_LIST_GAP}') &&
    activityChooser.includes('spacing={ROW_SURFACE_LIST_GAP}') &&
    chooser.includes('spacing={ROW_SURFACE_LIST_GAP}') &&
    ROW_SURFACE_LIST_GAP === 8,
  'tracker and activity chooser rows must use one shared list gap'
);
assert(
  habitList.includes('HABIT_ROW_MIN_HEIGHT = 72') &&
    habitList.includes('outcome subtitle and the current-streak summary'),
  'habit cards must document their taller content exception'
);
assert(
  habitItem.includes('HABIT_ROW_STREAK_WIDTH') &&
    habitItem.includes('minWidth: HABIT_ROW_STREAK_WIDTH') &&
    habitItem.includes("marginLeft: 'auto'") &&
    habitItem.includes('flexShrink: 0') &&
    habitItem.includes('Current Streak'),
  'habit streak metrics must stay in a fixed right-aligned non-wrapping column'
);
assert(
  settingsScreen.includes('getRowSurfaceLayoutStyle()') &&
    settingsScreen.includes('borderBottomWidth: isLast ? 0 : ROW_SURFACE_DIVIDER_WIDTH') &&
    ROW_SURFACE_DIVIDER_WIDTH === 1,
  'settings list rows must reuse compact geometry while retaining grouped dividers'
);
assert(
  emptyState.includes('getRowSurfaceStyle'),
  'collection empty states must reuse the shared surface treatment'
);
assert(
  appScreen.includes('const screenBackground = backgroundColor ?? colors.background'),
  'screens must use the theme background so row surfaces remain visibly elevated'
);
console.log('Validated shared catalog/list geometry and default page surface ownership.');
