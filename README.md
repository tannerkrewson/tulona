# Tulona

Tulona is an offline-first Expo application for time tracking, routines, and
habits. Local storage remains the source of truth; optional Dropbox backup
keeps a complete copy of the active dataset off-device.

## Foundation Baseline

- Expo SDK 57 with TypeScript and Expo Router.
- `src/domain` and `src/data` are framework-independent boundaries.
- `@domain`, `@data`, `@app`, `@ui`, `@theme`, `@icons`, and `@tests` aliases are
  declared in `tsconfig.json` for feature work and tests.
- Approved application dependencies are locked in `package-lock.json`; Workbox
  CLI and `gh-pages` are development dependencies for the later static web lane.

Run the baseline checks with:

```bash
npm install
npm run typecheck
npm run lint
npm run format
npm start
```

For Fedora Silverblue and Toolbox setup, see [`docs/development.md`](docs/development.md).

## Static Web Deployment

The production web artifact is a static Expo export followed by conservative
Workbox generation. It does not require a backend or a server process:

```bash
npm run web:build
```

The default GitHub Pages project-site path is `/tulona`, matching this
repository's remote name. Set `EXPO_BASE_URL` to a slash-prefixed project path
when deploying a fork or another project site, for example
`EXPO_BASE_URL=/another-name npm run web:build`. The same value configures Expo
Router, generated asset URLs, the manifest links, Workbox precache URLs, and
service-worker scope. `npm run deploy` builds the artifact and publishes `dist`
to `gh-pages` with `--nojekyll`.

The export also copies the root shell to `404.html`. GitHub Pages can use that
static fallback for direct reloads of nested or dynamic routes; no backend
rewrite process is required.

The generated service worker precaches local HTML, JavaScript, CSS, fonts,
icons, manifest data, and bundled audio. It has no arbitrary remote runtime
cache. Workbox leaves new workers waiting, so an active routine is not
replaced in the middle of a session; a later safe navigation activates the
update.

## Native iOS, widget, and Live Activity

Tulona is also configured as a native iOS app with bundle identifier
`com.tannerkrewson.tulona`. The small and medium home-screen widget shows the
current activity, its activity/folder color, and a live elapsed timer, and
opens that session when tapped. While a routine is running or paused, the
widget switches to a routine design with the current step, a countdown (or
overtime count-up), step progress, and what is up next, and opens the routine.
Timers are rendered by WidgetKit, so they keep updating while the app is not in
the foreground.

A Live Activity (lock screen and Dynamic Island) is shown only during an active
routine; tracking a plain activity does not start one. It ends when the routine
finishes or another activity interrupts it.

Native iOS and Android builds use Expo Router's platform-native tabs, while
the web/PWA keeps the styled JavaScript tab bar. On iOS 26 and later, the
system tab bar supplies the native Liquid Glass appearance and the activity
control uses the native bottom accessory. Tracker folders live in a nested
native Stack, so the standard left-edge swipe returns to Tracker.

Screens lay out with React Native views (`src/ui/primitives.tsx`) on every
platform. On iOS, SwiftUI is hosted only at the leaves: pickers, sliders, the
system color well, header menus (add, filter, and habit edit actions), and the
habit row context menu. Exports hand a file to the system share sheet, so
"Save to Files" works for JSON and CSV backups. Dropbox synchronization works the same way
in the native app as on the web (see below).

Run `npm run ios` on macOS to generate and launch the native project locally.
The native project is generated from Expo configuration and is intentionally
not committed; `expo prebuild` recreates it whenever native configuration
changes.

The [`Build iOS IPA`](.github/workflows/build-ios.yml) workflow validates the
native project and widget on pull requests, then uses a macOS GitHub runner and
Xcode on pushes to `main` and manual runs. It deliberately disables code
signing, packages the device build as an IPA, and verifies that the widget
extension is inside the archive. It needs no Expo account, EAS project, Apple
Developer account, or repository secrets.

Expo modules build from source on iOS, using the runtime versions in the lockfile.
This avoids Swift ABI mismatches between precompiled Expo UI and Expo JSI
frameworks. Before uploading an IPA, CI checks that the app and widget's imported
Expo JSI symbols exist in their embedded runtime frameworks.

The resulting IPA is unsigned. It is useful as a build artifact for inspecting
or handing off the archive, but iOS will not install or run it on a physical
device until it is signed with an Apple certificate and provisioning profile.
For a local unsigned archive on macOS, generate the project with
`npx expo prebuild --platform ios`, run `pod install --project-directory=ios`,
then use the same `xcodebuild` signing flags from the workflow.

## Dropbox Synchronization

Create a Dropbox app with these scopes and set its app key when building or
starting Expo:

- `files.content.read` to download synchronized and legacy backup files.
- `files.content.write` to create and update the synchronization document.
- `files.metadata.read` to read the Dropbox file revision used for conditional
  updates.

```bash
EXPO_PUBLIC_DROPBOX_APP_KEY=your-app-key npm run web
```

Register the callback route in the Dropbox app configuration. With Tulona's
default `/tulona` base path, local web development uses
`http://localhost:8081/tulona/dropbox-auth`; the default GitHub Pages
deployment uses `https://<account>.github.io/tulona/dropbox-auth`. If
`EXPO_BASE_URL` is changed, use that path in the callback instead. Native
builds use the `tulona://dropbox-auth` scheme.

Open Settings → Data → Backup & restore and connect Dropbox. Tulona uses the
Dropbox SDK's PKCE flow, so no app secret is shipped to the client. If this app
was already connected with the old write-only permission, disconnect and
reconnect after updating the Dropbox app permissions so Dropbox grants the new
read scopes.

Synchronization uses [Yjs](https://docs.yjs.dev), a pure JavaScript CRDT, so
it runs unchanged in browsers and in Hermes on iOS. Yjs loads the first time
sync runs. Hermes has no Web Crypto, so the native build installs one from
`expo-crypto` (`src/backup/web-crypto.native.ts`) for the Dropbox SDK's PKCE
codes and Yjs client IDs.

To try sync in the iOS app, put the key in `.env.local` before starting Metro,
and register `tulona://dropbox-auth` as a redirect URI in the Dropbox app:

```bash
echo 'EXPO_PUBLIC_DROPBOX_APP_KEY=your-app-key' >> .env.local
npm run ios
```

Tulona stores its persistent Yjs document in `/tulona-sync.yjs`. It reads
the current file revision, merges it with local IndexedDB state, validates the
merged dataset, and updates the file only against that exact revision. Initial
creation also uses a conditional add; a competing creator triggers a fresh
download and merge. A bounded retry handles later revision conflicts.

When enabled, automatic synchronization runs after startup and debounced local writes, and
when the app returns to the foreground or regains network connectivity. The existing manual
action now synchronizes immediately. The Yjs document and its projected
dataset are stored locally so a reload does not rebuild synchronization state
from a backup snapshot. Changes from another tab are announced with
`BroadcastChannel`; browser locks reduce duplicate work, while Dropbox revision
checks and the CRDT merge provide correctness.

`/tulona-backup.json` remains the human-readable backup and restore format. It
is not repurposed as the CRDT file. After a successful sync, Tulona conditionally
updates this JSON projection too. When `/tulona-sync.yjs` does not exist, Tulona
asks which data to use before migrating the legacy JSON and updating the JSON
projection. The regular Backup & restore
export/import actions continue to use JSON.

When Dropbox contains a different dataset, an older backup, a missing previously
synced file, or unreadable sync history, synchronization pauses for a setup review.
The review shows local and cloud record counts and offers **Use Dropbox data**
(replace all current local records and settings), **Use this device’s data**
(replace the cloud dataset), or **Combine both datasets** when cloud data is valid.
Combining treats matching IDs as the same record and keeps the Dropbox version
of it; different IDs remain separate. Canceling the confirmation changes
nothing; Disconnect keeps both sources separate. Reconnect can change accounts.
A readable JSON backup can also recover an unreadable sync document.

Before a confirmed setup changes data, Tulona saves the local JSON recovery copy
and uploads unique `/tulona-recovery-<id>-*` files containing the original local
JSON, cloud document/backup, and local sync history. If recovery uploads fail,
replacement stops. Export the last local recovery copy from the Dropbox panel
and restore it through Backup & restore; older JSON copies are in Dropbox.
Original `.yjs` recovery files retain cloud synchronization history. Recovery
files are retained until you delete them yourself. The local recovery copy stays
after disconnecting. Confirmation is bound to the reviewed local snapshot and
cloud revisions: changes during review require a fresh choice. Interrupted setup
also requires review before another sync can run, including after a reload.
Replacing the cloud dataset starts new sync history so other devices must review
it instead of automatically merging the replaced data back in.

The document holds one map per collection, keyed by record ID (habit days by
habit and day, weekly goal statuses by week and goal), with each record stored
whole. Each sync records only the records this device changed or deleted since
its last sync, so edits to different records always merge, and settings merge
field by field. When two devices edit the same record before syncing, every
device converges on one complete version of it. A device joining with no sync
history keeps the Dropbox version of shared records and adds only records
Dropbox lacks.

Merged data still has to pass backup validation, so the projection repairs the
cases where concurrent edits could break it. Two devices recording a tracker
transition at the same instant keep both in the document, and the projection
picks one deterministically. When one device deletes something another just
referenced, the projection does what the app does locally:

- A deleted goal takes its weekly statuses with it.
- A deleted status definition that is in use again comes back.
- A correction whose original transition was deleted stands on its own.

## Read-only MCP server

Tulona includes a stdio MCP server that reads its Dropbox backup from another
machine using independent read-only Dropbox authorization. It shares the app's
backup validation and tracked-time calculations. You can launch it directly
from this GitHub repository's `mcp` branch using `npx`, or run the included
Node.js bundle. Neither option installs the Expo dependencies or needs peer
dependency workarounds. See [MCP setup and tools](mcp/README.md).

## Universal UI Convention

Feature screens should render through `Screen` from `@ui`. `Screen` owns the
cross-platform `@expo/ui` `Host` and uses Universal `Column`, `Row`, and
`ScrollView` primitives. Compose feature content with Universal `List`,
`Text`, and `Button` where those controls fit. `RNHostView` is reserved for a
React Native or third-party view that cannot be represented by the Universal
primitives; it is not a general layout replacement.

Use explicit callbacks for feature actions. Keep domain values and persisted
records free of React components: store an `IconName` string from `@icons`, and
render it only at the `AppIcon` boundary. Theme colors are semantic foreground
and background pairs, and active state visuals include a label and icon so
state is never communicated by color alone.
