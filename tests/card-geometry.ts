import {
  getRowSurfaceLayoutStyle,
  getRowSurfaceStyle,
  ROW_SURFACE_BORDER_WIDTH,
  ROW_SURFACE_CONTENT_GAP,
  ROW_SURFACE_HEIGHT,
  ROW_SURFACE_ICON_SIZE,
  ROW_SURFACE_PADDING_HORIZONTAL,
  ROW_SURFACE_RADIUS,
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
const activityRow = read('src/tracker/ActivityRow.tsx');
const folderRow = read('src/tracker/FolderRow.tsx');
const habitList = read('src/habits/HabitListScreen.tsx');
const settingsScreen = read('src/settings/SettingsScreen.tsx');
const emptyState = read('src/ui/EmptyState.tsx');
const activitiesScreen = read('src/tracker/ActivitiesScreen.tsx');
const folderDetail = read('src/tracker/FolderDetailScreen.tsx');
const chooser = read('src/routine/NextActivityChooserScreen.tsx');

const compactRow = {
  ...getRowSurfaceStyle({ backgroundColor: '#FFFFFF', borderColor: '#D4D4D4' }),
  ...getRowSurfaceLayoutStyle(),
};

assert(
  compactRow.height === ROW_SURFACE_HEIGHT &&
    compactRow.paddingHorizontal === ROW_SURFACE_PADDING_HORIZONTAL &&
    compactRow.borderRadius === ROW_SURFACE_RADIUS &&
    compactRow.borderWidth === ROW_SURFACE_BORDER_WIDTH,
  'compact rows must share one height, inset, radius, and border weight'
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
  folderRow.includes('backgroundColor: colors.surface') &&
    folderRow.includes('borderColor: colors.border') &&
    !folderRow.includes("borderColor: 'transparent'") &&
    !folderRow.includes('borderWidth: 0'),
  'folder rows must use the same visible outline treatment as activities'
);
assert(
  activityRow.includes('active ? accent : colors.surface') &&
    activityRow.includes('active ? onAccent : colors.text'),
  'activity active-state color semantics must remain intact'
);
assert(
  habitList.includes('getRowSurfaceStyle') &&
    habitList.includes('HABIT_ROW_MIN_HEIGHT = 72') &&
    habitList.includes('outcome subtitle and the current-streak summary'),
  'habit cards must share the surface outline while documenting their taller content exception'
);
assert(
  settingsScreen.includes('getRowSurfaceLayoutStyle()') &&
    settingsScreen.includes('borderBottomWidth: isLast ? 0 : ROW_SURFACE_BORDER_WIDTH'),
  'settings list rows must reuse compact geometry while retaining grouped dividers'
);
assert(
  emptyState.includes('getRowSurfaceStyle'),
  'collection empty states must reuse the shared surface outline'
);
console.log(
  'Validated shared catalog/list geometry; global frame scope remains a human follow-up.'
);
