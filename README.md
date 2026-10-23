# Floria SelfDock ⚓

> Open-source software, built with simplicity in mind. — [FloriaApps](https://github.com/FloriaApps)

[![Deploy](https://github.com/FloriaApps/Floria-selfdock/actions/workflows/deploy.yml/badge.svg)](https://github.com/FloriaApps/Floria-selfdock/actions/workflows/deploy.yml)

**English** · [Português (Brasil)](README.pt-BR.md)

A friendly, [Material Design 3](https://m3.material.io) dashboard for your home lab. It finds the apps running in your Docker, keeps their status up to date in real time, and lets you start, stop and restart each one with a tap. Built for people who would rather not edit YAML files.

SelfDock is the **web and Docker** counterpart of [Floria SelfHub](https://github.com/FloriaApps/Floria-selfhub), the desktop app: same idea, different home.

## What it does

- **Automatic cards.** Reads your Docker containers and builds the dashboard by itself (name, description, category and port).
- **Automatic icons.** Works out each app's logo from its image name, downloads it once from [dashboard-icons](https://github.com/homarr-labs/dashboard-icons) and keeps it in the data volume. After that it works offline.
- **Real time.** Docker tells SelfDock when something changes, and the dashboard updates instantly over WebSocket.
- **Start, stop and restart**, with confirmation, plus **logs**.
- **Server metrics.** Disk, memory and processor.
- **Downtime history.** When each app went down, why (e.g. "ran out of memory") and for how long. Shows availability over 24 hours and 7 days. Stops you requested from the dashboard do not count as downtime.
- **Image updates.** Checks public registry digests and marks containers whose image has a newer version available. The Docker socket proxy must allow read-only image metadata (`IMAGES=1`); private registries may not be checkable.
- **Alerts.** An app stopped, an app failing its health check, an app restarting in a loop, disk or memory almost full.
- **Compose and `.env` editor.** Edit your stacks' files in the browser, with checks as you type (including ports already in use) and automatic backups. See [below](#edit-compose-and-env-files-stack-editor).
- **Services outside Docker** (router, NAS...). Add the address and SelfDock checks that it is up.
- Login required, light and dark themes, and **dynamic colour** (Material You) generated from the colour you pick. You can also choose the colour style (tonal, vibrant, expressive...), the contrast level, and turn the springy "expressive" animations on or off.
- **English and Portuguese (Brazil).** English is the default; it follows your browser language and can be changed in Settings.

## Try it now (demo mode, no Docker needed)

Requires Node 22.13 or newer.

```bash
npm install
npm run dev:demo
```

Open http://localhost:5173, create your user and you are in. Demo mode starts a fake Docker with 13 apps, including one that crashes now and then so you can see history and alerts at work.

## Install on your server (Docker Compose)

### From a release (nothing to build)

Every release publishes a multi-architecture image (amd64 and arm64, so it also runs on a Raspberry Pi) and a ready-to-run compose file:

```bash
mkdir floria-selfdock && cd floria-selfdock
curl -LO https://github.com/FloriaApps/Floria-selfdock/releases/latest/download/docker-compose.yml
curl -L  https://github.com/FloriaApps/Floria-selfdock/releases/latest/download/env.example -o .env
docker compose up -d
```

Image tags on `ghcr.io/floria-apps/floria-selfdock`: `latest` (newest release), `0.1.0` (a specific version) and `edge` (the current `main` branch).

### From source

```bash
cp .env.example .env
docker compose up -d --build
```

Open `http://SERVER-IP:3000` and create your account on first use.

The `docker-compose.yml` also starts **docker-socket-proxy**, a "doorman" that only lets SelfDock list containers, read logs, check image metadata, and start/stop/restart them. SelfDock itself never receives the Docker socket.

> **About `:ro` on the socket.** Mounting `/var/run/docker.sock:ro` does **not** make Docker read-only: `:ro` only protects the socket file, and the API still accepts any command. Whoever can reach the socket controls the whole machine. That is why the default compose file uses the proxy. `docker-compose.simple.yml` (direct socket) exists only for trusted home networks.

## How SelfDock finds each app

Everything is automatic, but you can fine-tune it with **labels** on the container:

| Label | Purpose | Example |
|---|---|---|
| `floria.name` | Display name | `My Library` |
| `floria.description` | Short line under the name | `Movies and TV shows` |
| `floria.icon` | Icon from dashboard-icons | `jellyfin` |
| `floria.category` | `media`, `home`, `network`, `files`, `security`, `arr` or `other` | `media` |
| `floria.port` | Port to open (useful with `network_mode: host`) | `8123` |
| `floria.url` | Full address (if you use a reverse proxy) | `https://movies.home.lan` |
| `floria.hide` | Do not show this container | `true` |

Without labels, SelfDock uses the image name (e.g. `ghcr.io/immich-app/immich-server` → icon `immich`), recognises about 45 popular apps and puts the rest under "Other". You can also edit the name, icon and category from each app's ⋮ menu, or hide it.

## Edit compose and .env files (stack editor)

SelfDock can open the `docker-compose.yml` and `.env` of your stacks, check them as you type, and save them with a backup.

- **Checks, shown on the right line:** YAML errors, a missing `services:` section, `${VARIABLES}` that are not defined in `.env`, duplicate ports and container names, **ports already used by another container (with a free port suggested)**, and risky settings such as privileged mode, a mounted Docker socket, floating `latest` tags and a missing restart policy.
- **Backups:** every save keeps the previous version (the last 30 of each file) in the data volume. Open *Previous versions* to bring one back.
- **No lost edits:** if a file changes on disk while you are editing it (another tab, or you over SSH), SelfDock refuses to overwrite it and offers to reload.
- **Apply (optional):** runs `docker compose up -d`, `pull`, `restart`, `stop` or `down` and streams the output live. It never deletes volumes.

It is off until you point SelfDock at your stacks folder (one sub-folder per stack, each with a `compose.yaml` and an optional `.env`):

```bash
# in your .env
STACKS_DIR=/opt/stacks
docker compose -f docker-compose.yml -f docker-compose.stacks.yml up -d
```

The folder is mounted at the **same path** inside SelfDock, because `docker compose` sends file paths to the Docker host. SelfDock runs as `SELFDOCK_UID:SELFDOCK_GID` (default `1000:1000`), which must be able to write in that folder.

To also run `docker compose` from the dashboard, add `docker-compose.stacks-apply.yml`. **Read its warning first:** creating containers is the same as full control of the server, so anyone with the dashboard password could start a container that mounts the host's disk. Use a strong password, and do not expose SelfDock to the internet without HTTPS. Both files are attached to every release.

## Configuration

Environment variables for the container:

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Dashboard port |
| `DATA_DIR` | `/data` | Where the database (SQLite) and icons live |
| `DOCKER_HOST` | `unix:///var/run/docker.sock` | How to talk to Docker (`tcp://docker-proxy:2375` in the compose file) |
| `DISK_PATH` | `DATA_DIR` | Folder used to measure the disk. Mount `/:/host:ro` and use `/host` for the real disk |
| `FLORIA_STACKS_DIR` | unset | Folder with your stacks. Turns the compose and `.env` editor on |
| `FLORIA_STACKS_APPLY` | off | `1` = allow running `docker compose` from the editor (see the warning above) |
| `FLORIA_TRUST_PROXY` | off | Set `1` behind Caddy, Traefik or Nginx (secure cookie over HTTPS) |
| `FLORIA_ICONS_OFFLINE` | off | `1` = never download new icons from the internet |
| `FLORIA_ICON_BASES` | jsDelivr + GitHub | Icon sources, comma-separated |
| `FLORIA_DEMO` | off | `1` = demo mode |

## How it works

```
apps/server       Fastify + WebSocket + SQLite (node:sqlite, no native dependency)
apps/web          React + Vite + Tailwind + TypeScript, with Material 3 Expressive components
packages/shared   types and categories used by both sides
```

- **Docker.** A small Docker Engine API client with no dependencies, over a socket or TCP. Events (`start`, `die`, `oom`, `health_status`...) update the dashboard instantly, and a full sync every 30 s repairs anything that was missed.
- **Downtime.** SelfDock compares each app's state before and after every event. An app going from "running" to "stopped / unhealthy / restarting" opens an incident, and it closes when the app comes back. The cause comes from the exit code of the `die` event and from the `oom` event. When SelfDock sees an app for the first time it does not invent a downtime: it only records what it observes.
- **Real time.** `GET /api/ws` sends a `snapshot` on connect and then only changes (`service.upsert`, `metrics`, `alerts`...). The dashboard reconnects by itself with growing delays.
- **Material 3 components.** The interface is built with [M3E](https://matraic.github.io/m3e/), a library of Material 3 Expressive web components (buttons, chips, switch, slider, menus, dialogs, bottom sheet, navigation, lists, progress indicators). `<m3e-theme>` generates every colour from your seed colour. The code editor (CodeMirror) lives in its own Shadow DOM, because M3E rewrites the page's adopted style sheets and would drop the editor's styles.
- **Languages.** The server sends neutral codes and parameters (alert kinds, cause codes, error codes); the dashboard turns them into text. Adding a language means adding one file in `apps/web/src/lib/i18n/`. TypeScript checks that no key is left untranslated.
- **Security.** Passwords hashed with scrypt, sessions in an `HttpOnly` + `SameSite=Lax` cookie, origin checks on requests that change data and on the WebSocket, login rate limiting, security headers and a CSP.
- **Data.** `/data/selfdock.db` (users, customisations, history) and `/data/icons`. Back up this volume.

### API (summary)

`GET /api/services` · `POST /api/services/:id/action` `{action: start|stop|restart}` · `PATCH /api/services/:id` · `GET /api/services/:id/logs` · `POST /api/services/manual` · `GET /api/stacks` · `GET|PUT /api/stacks/:name` · `POST /api/stacks/validate` · `POST /api/stacks/:name/apply` · `GET /api/history` · `POST /api/alerts/:id/dismiss` · `GET|PUT /api/settings` · `GET /api/ws`

## Development

```bash
npm run dev          # server (3000) + dashboard with hot reload (5173), using your Docker
npm run dev:demo     # the same, with the fake Docker
npm run typecheck
npm test             # 31 tests, including an end-to-end one that starts the real server
npm run build
```

Pull requests run type-checking, the tests, and a build-and-start check of the Docker image. Pushing a version tag (`git tag v0.1.0 && git push origin v0.1.0`) publishes the image and creates the GitHub Release. See [CONTRIBUTING](.github/CONTRIBUTING.md).

## Known limitations

- The automated tests run against the fake Docker (which speaks the same protocol), not a real Docker Engine. The Dockerfile image has not been built in an environment with Docker yet.
- The stack editor's Apply actions and the `docker compose config` check were tested against a stand-in `docker` program, not a real Docker with the compose plugin.
- The editor shows problems and keeps backups, but has no side-by-side diff yet.
- The dashboard's main JavaScript file is about 1.2 MB (270 KB compressed), mostly the M3E components. The editor loads separately, only when you open a stack.
- The Material Symbols icon font is 4.5 MB (it ships with the app so it works offline). It can be reduced by generating only the icons in use.
- Manual services with a self-signed HTTPS certificate show as down.
- One user for now; there is no password recovery in the interface.
- Icons come from the dashboard-icons project; the logos belong to their respective projects.
- The interface uses [M3E](https://github.com/matraic/m3e) by matraic, and Material colours come from `@material/material-color-utilities`. Thanks to both.

## Contributing

Found a bug or have an idea? Open an Issue or a Pull Request. Check the project's documentation first.

*Build useful things. Keep them simple. Keep them open.*
