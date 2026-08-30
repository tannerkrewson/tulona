# Fedora Silverblue Development

Tulona runs as a normal Node and Expo web project. Fedora Silverblue users can
keep the development tools in a Podman-backed Toolbox while keeping the source
tree in persistent host storage. The application does not require a container,
backend, database service, or Docker Compose at runtime.

## Prerequisites

- Fedora Silverblue with `podman` and `toolbox` available on the host.
- An active Node.js LTS release, Node.js 20 or newer. Check with `node --version`.
- `npm`, using the version bundled with Node.js. This repository uses
  `package-lock.json`; use npm rather than pnpm or Yarn.
- A host web browser for Expo web and the generated static site.

## Create the Toolbox

Create the Toolbox once and install the command-line tools inside it:

```bash
toolbox create
toolbox enter
sudo dnf install -y git nodejs npm
```

If the Toolbox already has a supported Node.js LTS installed, the package
installation step can be skipped. Confirm both tools before continuing:

```bash
node --version
npm --version
```

## Clone Persistent Source

Clone under the home directory, for example `~/src`, `~/Projects`, or another
directory under `/var/home`. Toolbox shares this persistent home with the host.
Do not keep the clone under `/tmp`, `/run`, or a directory created only inside a
temporary container layer; deleting the Toolbox must not delete the source tree.

```bash
mkdir -p ~/src
cd ~/src
git clone <repository-url> tulona
cd tulona
npm ci
```

## Run Web Development

Start Expo web from the Toolbox:

```bash
npm run web
```

Open the URL printed by Expo in the host browser. With the default Expo port it
is usually `http://localhost:8081`. Toolbox networking exposes the development
server on the host; if Expo selects another port, use that printed URL instead.
To request a specific host explicitly:

```bash
npm run web -- --host localhost
```

Run the normal checks from the Toolbox before handing off changes:

```bash
npm run typecheck
npm run lint
npm run format
npm run web:build
```

The production web path is documented in the root README. It defaults to the
GitHub Pages project path `/tulona`; `EXPO_BASE_URL` can override that path for
another project site.
