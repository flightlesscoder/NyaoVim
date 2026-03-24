**Status:** pending

# 10 — Update Remaining Dependencies

## Overview

After completing tasks 01–09, several dependencies still need to be updated to their current major versions. This task covers all packages not handled in earlier tasks, including production dependencies and stale `@types/*` packages.

## Dependencies to Update

### Production Dependencies

| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| `about-window` | ^1.11.0 | ~1.15+ | Verify Electron 34 compat |
| `electron-window-state` | ^4.1.1 | ^5.0.3 | Minor API changes |
| `deep-extend` | ^0.5.0 | ^0.6.0 | Patch for prototype pollution CVE |
| `mkdirp` | ^0.5.1 | ^3.0.1 | API change: callbacks removed |
| `promised-neovim-client` | ^2.0.2 | Check npm | May be unmaintained — see below |

### Dev Dependencies

| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| `cross-env` | ^5.1.4 | ^7.0.3 | Stable, minor update |
| `npm-run-all` | ^4.1.2 | ^4.1.5 or npm-run-all2 | Original unmaintained; use `npm-run-all2` fork |
| `@types/node` | ^9.6.6 | ^22.0.0 | Major update; needed for task 05 |
| `@types/deep-extend` | ^0.4.31 | ^0.4.32 | Patch update |
| `@types/mkdirp` | ^0.5.2 | Remove | mkdirp 3 ships its own types |
| `@types/fbemitter` | ^2.0.32 | Check | May be unused after refactor |
| `@types/flux` | ^3.1.7 | Check | May be unused |
| `@types/react` | ^16.3.12 | Remove | React is not used in this project |
| `@types/bluebird` | ^3.5.20 | Remove | After task 06 removes Spectron |
| `@types/q` | ^2.x.x | Remove | After task 06 removes Spectron |
| `@types/webdriverio` | ^4.10.1 | Remove | After task 06 removes Spectron |

## Steps

### Step 1 — Remove unused `@types` packages

First identify which type packages are actually needed. Run the build and check for type errors after removing candidates:

```bash
npm uninstall @types/react @types/bluebird @types/q @types/webdriverio
npm run build
```

`@types/react` has no corresponding `react` in dependencies, suggesting it was added speculatively. The others are Spectron/WebdriverIO-related and will be removed by task 06.

After task 03 removes Polymer:
```bash
npm uninstall @types/fbemitter @types/flux
```

(fbemitter and flux were used internally by Polymer 2.)

### Step 2 — Update `@types/node`

This is a prerequisite for task 05 (strict TypeScript):

```bash
npm install --save-dev @types/node@^22
```

Run `npm run build` and address any Node.js API changes surfaced by the updated types.

### Step 3 — Update `deep-extend`

```bash
npm install deep-extend@latest
```

The `^0.6.0` release patches a prototype pollution vulnerability present in `0.5.x`. No API changes.

### Step 4 — Update `mkdirp`

```bash
npm install mkdirp@latest
```

`mkdirp` 1.0.0 dropped the callback API. Check usage:

```bash
grep -rn "mkdirp" main/ renderer/ --include="*.ts"
```

If callback-style is used, convert to async:

```typescript
// OLD
import mkdirp from 'mkdirp';
mkdirp(dirPath, callback);

// NEW
import { mkdirp } from 'mkdirp';
await mkdirp(dirPath);
// mkdirp now also ships its own types; remove @types/mkdirp
```

Remove the now-unnecessary `@types/mkdirp`:
```bash
npm uninstall @types/mkdirp
```

### Step 5 — Assess `promised-neovim-client`

`promised-neovim-client` is a production dependency providing the Neovim RPC client. Check its status:

1. Visit its npm page to check last publish date and version.
2. Check if `neovim` (the official JS Neovim client) is a better replacement:
   ```bash
   npm view neovim
   ```
3. If `promised-neovim-client` is unmaintained, evaluate migrating to `@neovim/api` or `neovim`.

The migration is non-trivial as the client API is used extensively in `renderer/nyaovim-app.ts`. If the package still works with modern Node.js and Electron, deferring the migration is acceptable.

### Step 6 — Update `npm-run-all`

The `npm-run-all` package is in maintenance mode. Switch to `npm-run-all2`, an actively maintained fork:

```bash
npm uninstall npm-run-all
npm install --save-dev npm-run-all2
```

The API is identical — no script changes needed.

### Step 7 — Update `cross-env`

```bash
npm install --save-dev cross-env@latest
```

Minor update; no API changes.

### Step 8 — Update `electron-window-state`

```bash
npm install electron-window-state@latest
```

Verify the API in `main/browser-config.ts`:

```typescript
// Current usage
import windowStateKeeper from 'electron-window-state';
const mainWindowState = windowStateKeeper({ defaultWidth: 800, defaultHeight: 600 });
```

Check the changelog for breaking changes between v4 and v5.

### Step 9 — Update `about-window`

```bash
npm install about-window@latest
```

Verify the About dialog still renders correctly after the Electron upgrade.

### Step 10 — Full dependency audit

After all updates:

```bash
npm audit
npm outdated
```

Address any remaining advisories. The `npm outdated` output should ideally be empty or contain only packages pinned intentionally.

### Step 11 — Update `neovim-component`

`neovim-component` is the `<neovim-editor>` Web Component that embeds the actual terminal. This package is the core of NyaoVim's functionality. Check its status:

1. Verify it works with Polymer 3 / Lit (after task 03).
2. Check if there's an updated version or a maintained fork.
3. If it uses `electron.remote` internally (likely, given its age), it may need its own upgrade or a fork.

This may be the most challenging dependency to update due to deep Electron/Polymer coupling.

## Verification

After all updates:

```bash
npm install
npm run build
npm run lint
npm audit --audit-level=moderate
npm run smoke-test
```

All four commands must pass without errors.

## References

- [mkdirp changelog](https://github.com/isaacs/mkdirp/blob/main/CHANGELOG.md)
- [npm-run-all2](https://www.npmjs.com/package/npm-run-all2)
- [electron-window-state releases](https://github.com/mawie81/electron-window-state/releases)
- [neovim npm package](https://www.npmjs.com/package/neovim)
