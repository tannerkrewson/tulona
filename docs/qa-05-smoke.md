# QA-05 Smoke Evidence

Date: 2026-08-30
Branch: `qa-smoke`
Artifact: `npm run web:build`
Server: dedicated static Node server at `http://127.0.0.1:8095`, mapping `/tulona/*` to `dist` and serving `dist/404.html` for nested-route fallback. Expo dev server was not used.

Evidence root: `/tmp/opencode/tulona-qa-05`

## Launch And Catalog

- PASS, empty launch. Fresh session `qa05-resume-launch` opened `http://127.0.0.1:8095/tulona/`, booted to `/tulona/onboarding`, and showed `Start empty` and `Add starter activities`. Evidence: `screenshots/launch-empty.png`.
- PASS, optional starter onboarding. Fresh session `qa05-starter` chose `Add starter activities` at `/tulona/onboarding`; `/tulona/` showed six starter folders and their children. Evidence: `screenshots/launch-starter-after.png`.
- PASS, root activity create with color/icon. From `/tulona/`, `New activity` opened `/tulona/activity/new`; saving `QA Root Activity` with `#176B87` returned to `/tulona/` and showed the created item. Evidence: `screenshots/catalog-new-activity-form.png`, `screenshots/catalog-new-activity-created.png`.
- PASS, folder create with color/icon. From `/tulona/`, `New folder` opened `/tulona/folder-edit/new`; saving `QA Folder` with `#B45309` returned to `/tulona/`. Evidence: `screenshots/catalog-new-folder-form.png`, `screenshots/catalog-new-folder-created.png`.
- PASS, folder edit/color. `/tulona/folder-edit/edafd763-5166-4705-8bf8-d01d67f3eed1` loaded the saved folder and accepted the edited name/color. Tracker later showed `QA Folder Edited Again` and the new color. Evidence: `screenshots/catalog-folder-edit-form.png`, `screenshots/catalog-folder-edit-persisted.png`.
- PASS, post-save editor refresh. In fresh session `qa05-fixverify3`, saving `Morning Routine Updated Again` with `#0F766E` refreshed the editor with both persisted values and the tracker retained the renamed folder after navigation. Evidence: `screenshots/catalog-editor-controlled-fix.png`.
- PASS, archive/restore for folder and activity. Confirmation controls appeared, archived records disappeared from the default catalog, `Show archived` exposed them, and restore returned them to active views. Evidence: `screenshots/catalog-folder-archive-confirmation.png`, `screenshots/catalog-folder-archived-hidden.png`, `screenshots/catalog-folder-archived-visible.png`, `screenshots/catalog-folder-restored-visible.png`, `screenshots/catalog-activity-archive-confirmation.png`, `screenshots/catalog-activity-archived-hidden.png`, `screenshots/catalog-activity-archived-visible.png`, `screenshots/catalog-activity-restored.png`.
- PASS, catalog ordering. `Move Up` moved `QA Folder Edited Again` ahead of `Leisure` in the folder list. Evidence: `screenshots/catalog-folder-order-before-archive.png`, `screenshots/catalog-folder-moved-up.png`.
- PASS, nested activity placement. From `/tulona/folder/edafd763-5166-4705-8bf8-d01d67f3eed1`, `Add activity` opened `/tulona/activity/new?folderId=edafd763-5166-4705-8bf8-d01d67f3eed1` with that folder selected; saving produced one visible child in the folder. Evidence: `screenshots/catalog-folder-add-activity-form.png`, `screenshots/catalog-folder-add-activity-child.png`.
- PASS, new routine route and folder placement. From the same folder, `Add routine` opened `/tulona/routine-edit/new?folderId=edafd763-5166-4705-8bf8-d01d67f3eed1` with the folder selected. Evidence: `screenshots/routine-new-form.png`.

## Tracker And History

- PASS, activity switch and persistence reload. `QA Root Activity` was started at `/tulona/`; a fresh navigation back to `/tulona/` still showed it active. A second session switched from `Morning Routine` to `Work`; the tracker showed `Work` active. Evidence: `screenshots/tracker-activity-started.png`, `screenshots/tracker-reloaded-active.png`, `screenshots/tracker-switch-to-work.png`.
- PASS, adjust-start validation and save. `/tulona/` showed the adjust sheet. An earlier timestamp was rejected with the visible message `The start cannot precede the immediately preceding transition`; a valid timestamp enabled `Save adjusted start` and persisted. Evidence: `snapshots/tracker-adjust-disabled.txt`, `screenshots/tracker-adjust-sheet.png`, `screenshots/tracker-adjusted-valid-saved.png`.
- PASS, history view and day navigation. `/tulona/history` showed derived intervals, recorded/stopped statuses, `Previous day`, `Next day`, boundary controls, and no-entry navigation for the prior day. Evidence: `snapshots/tracker-history.txt`, `screenshots/tracker-history-page.png`, `screenshots/tracker-history-previous-day.png`, `screenshots/tracker-history-next-day.png`.
- PASS, logical day. `/tulona/settings` changed `Logical day starts at` to `11:00 PM`; `/tulona/history` then labeled the current logical day `Saturday, August 29` while displaying the same recorded intervals. Evidence: `screenshots/settings-logical-day-11pm.png`, `screenshots/history-logical-day-11pm.png`.

## Routines

- PASS, create/edit and step authoring. `/tulona/routine-edit/new?folderId=edafd763-5166-4705-8bf8-d01d67f3eed1` created `QA Smoke Routine` with two steps, then `/tulona/routine-edit/e9138f77-44e2-493b-bd2d-660482c55970` edited its name/color and step title. Duplicate, reorder, delete confirmation, and delete were exercised. Evidence: `screenshots/routine-new-step-form.png`, `screenshots/routine-two-steps-before-create.png`, `screenshots/routine-created-editor.png`, `screenshots/routine-edited.png`, `screenshots/routine-step-duplicated.png`, `screenshots/routine-step-reordered.png`, `snapshots/routine-editor-steps.txt`, `screenshots/routine-step-delete-confirmation.png`, `screenshots/routine-step-deleted.png`.
- PASS, durable Run routine. Pressing `Run routine` on `/tulona/routine-edit/e9138f77-44e2-493b-bd2d-660482c55970` navigated to `/tulona/routine/e9138f77-44e2-493b-bd2d-660482c55970` with a live runner instead of an inactive-runner error. Evidence: `screenshots/routine-runner-started.png`.
- PASS, pause/resume. The runner changed from `Pause` to `Resume`, disabled `Done`/`Skip` while paused, and resumed with those controls active. Evidence: `screenshots/routine-paused.png`, `screenshots/routine-resumed.png`.
- PASS, add-time and overtime. The runner exposed `+1 min`, `+5 min`, `+10 min`, and `+30 min`; adding one minute changed an overtime display to `In progress` with remaining time. Evidence: `screenshots/routine-add-time-sheet.png`, `screenshots/routine-add-time-applied.png`, `snapshots/routine-runner-started.txt`.
- PASS, auto-advance/completion/chooser. A three-second auto-advance step advanced to the second step; expiration navigated to `/tulona/routine-chooser`, showing `QA Smoke Routine Edited completed` and next-item choices. Choosing `QA Root Activity` returned to `/tulona/` with that activity active. Evidence: `screenshots/routine-next-step-before-auto-advance.png`, `screenshots/routine-auto-advance-chooser.png`, `screenshots/routine-chooser-selected-next.png`.
- PASS, reopen after reload. Starting the routine from its folder at `/tulona/folder/edafd763-5166-4705-8bf8-d01d67f3eed1`, then reopening `/tulona/routine/e9138f77-44e2-493b-bd2d-660482c55970`, restored the live runner. Evidence: `screenshots/routine-reopened-runner.png`, `screenshots/routine-reload-recovered.png`.
- PASS, cancel navigation after durable finalization. `Cancel routine` showed confirmation; `Yes, cancel routine` returned to `/tulona/` with `No active activity`. Evidence: `screenshots/routine-cancel-confirmation.png`, `screenshots/routine-cancelled-return.png`.
- PASS, runner recovery error. Direct `/tulona/routine/not-a-routine` showed `Routine unavailable`, `There is no active routine to resume`, `Retry`, `Back to tracker`, and `Export raw local data`. Evidence: `screenshots/error-missing-routine.png`.

## Habits And Insights

- PASS, manual habit. Fresh session `qa05-habits2` opened `/tulona/habits`, marked `Morning Routine` complete, and showed `Completed manually`, a one-day streak, and `Signals: manual`. Evidence: `screenshots/habits-starter-list.png`, `screenshots/habits-manual-complete.png`.
- PASS, automatic/time-linked habit. `/tulona/habit/new` configured `Tracked activity time`, source `Morning Routine`, and a one-second threshold. After tracked time and switching to `Work`, `/tulona/habits` showed `Automatic tracked minutes`, `Completed automatically`, a one-day streak, and `Signals: automatic`. Evidence: `screenshots/habit-automatic-tracked-form.png`, `screenshots/habit-automatic-created.png`, `screenshots/habits-automatic-trigger-running.png`, `screenshots/habits-automatic-trigger-completed.png`.
- PASS, insights today/day/week. Fresh session `qa05-insights2` opened `/tulona/insights`, verified day view for `Sunday, August 30`, switched to week view, returned to day view, and used `Today`. Empty-state totals and timeline text were visible. Evidence: `snapshots/insights.txt`, `snapshots/insights-week.txt`, `screenshots/insights-empty-or-starter.png`, `screenshots/insights-week-view.png`, `screenshots/insights-today-day-view.png`.

## Backup, Project Site, And PWA

- PASS, JSON backup. `/tulona/backup` downloaded `/tmp/opencode/tulona-qa-05/export-resume.json`; it parsed as the `life-tracker-backup` envelope with settings and catalog data. Evidence: `snapshots/backup.txt`, `screenshots/backup-page.png`, `export-resume.json`.
- PASS, CSV backup. `/tulona/backup` downloaded `/tmp/opencode/tulona-qa-05/export-resume.csv`; it contained the expected derived-interval header. Evidence: `screenshots/backup-exports-triggered.png`, `export-resume.csv`.
- LIMITATION, malformed import. The browser showed the `Choose JSON backup` control, but Expo's web picker creates a hidden file input only after the click. CDP `upload` and a synthetic file-change event did not resolve the picker promise or display an import result/error. This is an agent-browser/headless file-picker limitation, not a claimed product pass or product defect. The exact attempted page was `http://127.0.0.1:8095/tulona/backup`; evidence: `screenshots/backup-malformed-error.png`.
- PASS, nested project-site reload. Fresh session `qa05-nested2` loaded `http://127.0.0.1:8095/tulona/folder/0e576dc8-49fe-44fb-9ce4-b39c73e7a8d5` directly and after a full reload still showed the `Morning Routine` folder and child. Evidence: `screenshots/nested-folder-loaded.png`, `screenshots/nested-folder-reload.png`.
- PASS, manifest and service-worker scope. Browser fetch of `/tulona/manifest.json` returned relative `start_url: "./"`, `scope: "./"`, standalone portrait metadata, and local icons. `navigator.serviceWorker` reported scope `http://127.0.0.1:8095/tulona/` and script `http://127.0.0.1:8095/tulona/sw.js`. Evidence: `screenshots/pwa-shell-online.png`, `dist/manifest.json`.
- PASS, offline shell. After the worker became active, `agent-browser set offline on` followed by reload at `/tulona/onboarding` still rendered `Start empty` and `Add starter activities`; no page errors were reported. Evidence: `screenshots/pwa-shell-offline-cdp.png`.
- PARTIAL, safe update. Static artifact validation passed, generated Workbox configuration has `skipWaiting: false` and `clientsClaim: false`, and the active browser registration reported `waiting: false`. A two-version deployment/update activation was not simulated because this run serves one generated artifact and changing the worker in place would invalidate the tested build. Evidence: `dist/sw.js`, `scripts/validate-pwa-build.cjs`, `screenshots/pwa-shell-online.png`.

## Responsive, Accessibility, And Errors

- PASS, narrow responsive layout. At `390x844`, tracker rendered all controls and `document.documentElement.scrollWidth` equaled `390`; evidence: `screenshots/responsive-narrow.png`.
- PASS, desktop responsive layout. At `1440x1000`, tracker rendered all controls and document/body scroll widths equaled `1440`; evidence: `screenshots/responsive-desktop.png`.
- PASS, keyboard path. On `/tulona/onboarding`, Tab focus moved through the skip link and both onboarding buttons; Enter activated `Add starter activities` and reached `/tulona/`. Evidence: `screenshots/accessibility-onboarding-focus.png`, `screenshots/accessibility-keyboard-starter.png`.
- PASS with incomplete audit checks, accessibility. Axe reported zero WCAG violations on onboarding and tracker. It reported one incomplete `color-contrast` check because React Native web elements were overlapped and their background could not be determined; no violation was reported. Activity editor inputs exposed `aria-label` values `Activity name` and `Activity color` for their `data-testid` elements. Evidence: `screenshots/accessibility-keyboard-starter.png`, `screenshots/catalog-new-activity-form.png`.
- PASS, validation/error paths. Empty activity and routine saves displayed recovery panels with `Validation error: Catalog names must not be empty`; invalid adjust-start displayed a specific boundary error; missing routine showed a recoverable runner error. Evidence: `screenshots/error-empty-activity.png`, `screenshots/error-empty-routine.png`, `snapshots/tracker-adjust-disabled.txt`, `screenshots/error-missing-routine.png`.

## Validated Recovered Edits

- `app/activity/new.tsx`, `app/folder-edit/new.tsx`, and `app/routine-edit/new.tsx` are required because existing tracker/folder actions navigate to those paths; all loaded and saved correctly.
- `CatalogEditorScreen.tsx` new-record navigation is validated by activity/folder saves returning to `/tulona/`.
- `BootCoordinatorGate.tsx` destination application guard is retained; direct nested and onboarding navigation did not loop, and continuation from `/tulona/onboarding` returned to `/tulona/`.
- `RoutineEditorScreen.tsx` durable start/error handling is validated by the live runner and missing-run recovery path.
- `RoutineRunnerScreen.tsx` cancel navigation is validated by durable cancellation followed by `/tulona/` and no active activity.
- `AccessibleTextInput.tsx` labeling is validated by browser DOM inspection and the axe runs.

## Discovered Follow-Up

- Beads bug `tulona-dos` was created before any follow-up edit: catalog editor inputs could display a stale value after a successful save while the heading showed the new value. It was reproduced at `/tulona/folder-edit/edafd763-5166-4705-8bf8-d01d67f3eed1`; evidence: `screenshots/catalog-folder-edited-confirmed.png` and `screenshots/catalog-folder-edit-persisted.png`. The editor refresh fix was then validated in fresh session `qa05-fixverify3`; evidence: `screenshots/catalog-editor-controlled-fix.png`.
