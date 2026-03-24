**Status:** pending

# 01 — Upgrade Electron from 1.8.4 to Latest

## Overview

Electron is the most critical dependency in this project. The currently installed version is **1.8.8** (spec: `^1.8.4`), released in 2018. The current stable release is **Electron 34.x**. This represents roughly 32 major versions and ~7 years of accumulated changes, security patches, Chromium updates, and API overhauls.

## Motivation

- **Security**: Electron 1.8 bundles Chromium 59, which has thousands of known CVEs. Every user of this app runs an unpatched browser engine.
- **Broken APIs**: Several APIs used by NyaoVim have been removed in subsequent Electron versions (see task 02 for `electron.remote`, `makeSingleInstance`, etc.). The app will not launch at all on Electron 9+.
- **Node.js compatibility**: Electron 1.8 ships Node.js 8.x (EOL since 2019). Modern Electron ships Node.js 22+.
- **Operating system support**: Modern macOS and Windows versions have dropped support for older Electron/Chromium runtimes.

## Steps

### Phase 1 — Audit breaking changes

1. Read the Electron upgrade guides for each major version:
   - [Electron 2.0 breaking changes](https://www.electronjs.org/docs/latest/breaking-changes)
   - Pay special attention to: `remote` module removal (v14), `makeSingleInstance` removal (v9), `webPreferences` security defaults changes (v5), `nodeIntegration` default change (v5), `contextIsolation` default change (v12).

2. Run a search for all Electron API usage in the codebase:
   ```
   grep -r "electron\." main/ renderer/ --include="*.ts"
   ```

3. Produce a list of every removed/changed API encountered and cross-reference with tasks 02 and 08.

### Phase 2 — Incremental upgrade path

Because 1→34 is a huge jump, upgrade in meaningful milestones to isolate breakage:

| Milestone | Electron | Key Change |
|-----------|----------|-----------|
| Step A | ^9.0.0 | `makeSingleInstance` removed → must fix first (see steps below) |
| Step B | ^12.0.0 | `contextIsolation` defaults to `true` |
| Step C | ^14.0.0 | `remote` module removed → must fix first (task 02) |
| Step D | ^34.x | Current stable |

Complete task 02 (remove `electron.remote`) **before** attempting Step C or later.

### Phase 3 — Fix `makeSingleInstance` (required before Electron 9)

In `main/browser-config.ts`, replace the deprecated call:

```typescript
// OLD (Electron 1–8)
const isSecondInstance = app.makeSingleInstance((argv, cwd) => {
    // focus existing window
});
if (isSecondInstance) {
    app.quit();
}

// NEW (Electron 9+)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, argv, cwd) => {
        // focus existing window
    });
}
```

### Phase 4 — Update `webPreferences` security defaults

Starting in Electron 5, `nodeIntegration` defaults to `false` and `contextIsolation` defaults to `true` (from Electron 12). The current app explicitly sets these in `main/browser-config.ts`. Audit the `BrowserWindow` constructor calls and ensure they are explicit rather than relying on defaults.

```typescript
// In main/browser-config.ts, ensure webPreferences includes:
webPreferences: {
    preload: path.join(__dirname, 'preload.js'), // required after task 02
    contextIsolation: true,
    nodeIntegration: false,
    // remove sandbox: false if present after verifying preload works
}
```

### Phase 5 — Update package.json

```json
"electron": "^34.0.0"
```

Also update `electron-packager` to a compatible version (it was renamed to `@electron/packager`):

```json
"@electron/packager": "^18.0.0"
```

And update `electron-window-state`:

```json
"electron-window-state": "^5.0.3"
```

### Phase 6 — Update type definitions

```bash
npm install --save-dev electron
```

The `@types/electron` package is no longer needed — types ship with `electron` itself since v4.

Remove from package.json if present:
```bash
npm uninstall @types/electron
```

### Phase 7 — Update Node.js target in TypeScript configs

Modern Electron ships with Node.js 22. Update `main/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"]
  }
}
```

And update `@types/node` to match:
```bash
npm install --save-dev @types/node@^22
```

### Phase 8 — Test after each milestone

After each milestone step (A through D), run:

```bash
npm run build
npm run app
npm run smoke-test
```

Fix failures before proceeding to the next milestone.

### Phase 9 — Update `about-window`

```bash
npm install about-window@latest
```

Verify it still works with the new Electron version.

## References

- [Electron Releases](https://releases.electronjs.org/)
- [Electron Breaking Changes](https://www.electronjs.org/docs/latest/breaking-changes)
- [Electron Security Checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Upgrade Guide 1→2](https://www.electronjs.org/docs/latest/breaking-changes#planned-breaking-api-changes-20)
