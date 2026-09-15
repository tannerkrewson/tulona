import { getSettingsCategory, settingsCategories } from '../src/settings/settings-categories';

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

const root = path.resolve(process.cwd());
const read = (relativePath: string): string =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const categories = read('src/settings/settings-categories.ts');
const settingsScreen = read('src/settings/SettingsCategoryScreen.tsx');
const goalsPanel = read('src/settings/GoalsSettingsPanel.tsx');

assert(
  settingsCategories.some(
    (category) =>
      category.id === 'goals' &&
      category.title === 'Goals' &&
      category.path === '/settings/goals' &&
      category.icon === 'award'
  ) && getSettingsCategory('goals')?.id === 'goals',
  'settings navigation must expose a Goals category'
);
assert(
  categories.includes("id: 'goals'") && categories.includes("path: '/settings/goals'"),
  'Goals must be a canonical settings category rather than a legacy alias'
);
assert(
  settingsScreen.includes("case 'goals':") && settingsScreen.includes('GoalsSettingsPanel'),
  'the settings category screen must render the Goals settings panel'
);
assert(
  goalsPanel.includes('loadGoalsRuntime') &&
    goalsPanel.includes('updateSettings({ reviewDay: Number(next) })') &&
    goalsPanel.includes('historicalCircleCount: Number(next)'),
  'Goals settings must persist the review day and historical circle count'
);
assert(
  goalsPanel.includes('createStatusDefinition') &&
    goalsPanel.includes('updateStatusDefinition') &&
    goalsPanel.includes('reorderStatusDefinitions') &&
    goalsPanel.includes('deleteStatusDefinition'),
  'Goals settings must expose create, edit, reorder, and delete status actions'
);
assert(
  goalsPanel.includes('goal-status-color') &&
    goalsPanel.includes("value: 'light-grey'") &&
    goalsPanel.includes('goal-status-delete-confirmation'),
  'status rows must expose semantic recoloring and deletion confirmation'
);
assert(
  !goalsPanel.includes('import { ColorPicker') && !goalsPanel.includes('custom goal color'),
  'Goals settings must not expose a custom goal color picker'
);

console.log('Validated Goals settings navigation and controls.');
