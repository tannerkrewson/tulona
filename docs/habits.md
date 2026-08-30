# Habit UI

Habit screens use `HabitService` through the feature-scoped store in
`src/habits/habit-store.ts`. The store loads records and day states through the
service, and manual completion calls `setManualCompletion` without changing the
automatic signal.

The existing dynamic route remains the only habit route:

- `/habit/new` opens the create editor.
- `/habit/:habitId` opens detail.
- `/habit/:habitId?edit=1` opens the edit editor.

Archived habits remain addressable from detail so they can be restored. The
editor consumes the catalog service for activity, folder, and routine trigger
choices. It does not evaluate triggers or write to persistence directly.
