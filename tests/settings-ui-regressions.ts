import { getSettingsCategory, settingsCategories } from '../src/settings/settings-categories';
import {
  getRowSurfaceStyle,
  ROW_SURFACE_BORDER_WIDTH,
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
const settingsScreen = read('src/settings/SettingsScreen.tsx');
const activityRow = read('src/tracker/ActivityRow.tsx');
const habitList = read('src/habits/HabitListScreen.tsx');

assert(
  settingsCategories.every((category) => !('subtitle' in category) && !('description' in category)),
  'main settings categories must remain subtitle-free'
);
assert(
  settingsCategories.every((category) => getSettingsCategory(category.id)?.path === category.path),
  'settings category rows must preserve their navigation paths'
);
assert(
  settingsScreen.includes('flex: 1') &&
    settingsScreen.includes('minWidth: 0') &&
    settingsScreen.includes("alignSelf: 'stretch'") &&
    settingsScreen.includes("justifyContent: 'center'") &&
    settingsScreen.includes('width: 24'),
  'settings arrows must use a fixed, vertically centered trailing column'
);
assert(
  settingsScreen.includes("overflow: 'hidden'") &&
    settingsScreen.includes('borderBottomWidth: isLast ? 0 : ROW_SURFACE_BORDER_WIDTH'),
  'settings list edges and dividers must render as one clipped surface'
);
assert(
  activityRow.includes('getRowSurfaceStyle') && habitList.includes('getRowSurfaceStyle'),
  'activity and habit rows must use the shared row surface treatment'
);
const rowSurface = getRowSurfaceStyle({ backgroundColor: '#FFFFFF', borderColor: '#D4D4D4' });
assert(
  rowSurface.borderRadius === ROW_SURFACE_RADIUS &&
    rowSurface.borderWidth === ROW_SURFACE_BORDER_WIDTH,
  'shared row surfaces must keep one consistent border weight and radius'
);

console.log('Validated settings navigation, list layout, and shared row-surface regressions.');
