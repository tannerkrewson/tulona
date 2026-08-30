# Tulona

Tulona is an offline-first Expo application for time tracking, routines, and
habits. This branch contains the foundation shell only. It deliberately has no
backend, accounts, synchronization, cloud backup, or platform-specific UI.

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
