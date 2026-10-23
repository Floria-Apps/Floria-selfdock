# Contributing to Floria SelfDock

Thanks for wanting to help! Bug reports, ideas, translations and pull requests are all welcome.

## Running it locally

Requires Node 22.13 or newer.

```bash
npm install
npm run dev:demo    # fake Docker with 13 apps: http://localhost:5173
npm run dev         # the same, against your own Docker
```

## Before opening a pull request

```bash
npm run typecheck
npm test
npm run build
```

CI runs the same checks and also builds the Docker image and starts it once.

## Project layout

```
apps/server       Fastify + WebSocket + SQLite
apps/web          React + Vite + Tailwind (Material Design 3)
packages/shared   types and categories used by both sides
```

## Adding or fixing a translation

1. Add the key to `apps/web/src/lib/i18n/en.ts` (English is the source of truth).
2. Add the same key to `pt-BR.ts`. TypeScript fails the build if a key is missing.
3. To add a new language, copy `pt-BR.ts`, translate it, and register it in `lib/i18n/index.ts` and in the language selector in `views/SettingsView.tsx`.

The server never sends sentences to the dashboard, only codes and parameters, so server messages do not need translating.

## Conventions

- Keep it simple. A small, readable change is better than a clever one.
- Code, comments and commit messages in English.
- Follow the Material Design 3 look and feel for anything visual, and use the [M3E](https://matraic.github.io/m3e/) components (`@m3e/react/...`) before writing a custom control. `apps/web/src/ui/controls.tsx` wraps them with the props the dashboard uses.

## Releasing (maintainers)

```bash
git tag v0.1.0
git push origin v0.1.0
```

The **Deploy** workflow publishes the image to `ghcr.io/floria-apps/floria-selfdock` (amd64 and arm64) and creates a GitHub Release with ready-to-run compose files.
