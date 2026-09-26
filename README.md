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

## Native iOS diagnostic build

Tulona is also configured as a native iOS app with bundle identifier
`com.tannerkrewson.tulona`. The home-screen widget integration is temporarily
disabled in the iOS build while diagnosing installation through Feather. The
diagnostic app therefore does not include a WidgetKit extension or app-group
entitlement.

Native iOS and Android builds use Expo Router's platform-native tabs, while
the web/PWA keeps the styled JavaScript tab bar. On iOS 26 and later, the
system tab bar supplies the native Liquid Glass appearance and the activity
control uses the native bottom accessory. Tracker folders live in a nested
native Stack, so the standard left-edge swipe returns to Tracker.

Run `npm run ios` on macOS to generate and launch the native project locally.
The native project is generated from Expo configuration and is intentionally
not committed; `expo prebuild` recreates it whenever native configuration
changes.

The [`Build iOS IPA`](.github/workflows/build-ios.yml) workflow validates the
native project on pull requests, then uses a macOS GitHub runner and Xcode on
pushes to `main` and manual runs. It deliberately disables code signing,
packages the device build as an IPA, and verifies that no app extension is
included. It uploads the `.ipa` directly, without an additional artifact ZIP.
It needs no Expo account, EAS project, Apple Developer account, or repository
secrets.

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

Tulona stores its persistent Automerge document in `/tulona-sync.am`. It reads
the current file revision, merges it with local IndexedDB state, validates the
merged dataset, and updates the file only against that exact revision. Initial
creation also uses a conditional add; a competing creator triggers a fresh
download and merge. A bounded retry handles later revision conflicts.

Automatic synchronization runs after startup and debounced local writes, and
when the app regains visibility or network connectivity. The existing manual
action now synchronizes immediately. The Automerge history and its projected
dataset are stored locally so a reload does not rebuild synchronization state
from a backup snapshot. Changes from another tab are announced with
`BroadcastChannel`; browser locks reduce duplicate work, while Dropbox revision
checks and Automerge provide correctness.

`/tulona-backup.json` remains the human-readable backup and restore format. It
is not repurposed as the CRDT file. After a successful sync, Tulona conditionally
updates this JSON projection too. When `/tulona-sync.am` does not exist, Tulona
bootstraps from the legacy JSON and combines independent local and remote
records before updating the JSON projection. The regular Backup & restore
export/import actions continue to use JSON.

Concurrent edits to separate records or fields merge automatically. Incompatible
edits, delete-versus-edit, routine ordering collisions, and tracker transitions
with duplicate timestamps are retained in Automerge conflict history and
reported in the Dropbox panel. For tracker timestamp collisions, the local
projection uses a deterministic winner to satisfy the domain's timestamp
uniqueness constraint while keeping both transitions in the sync document.

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
