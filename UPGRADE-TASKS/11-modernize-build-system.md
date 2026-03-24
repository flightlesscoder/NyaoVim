**Status:** done

# 11 — Modernize Build System

## Overview

The current build process is simple: TypeScript is compiled directly with `tsc`, with no bundler. Compiled `.js` files are committed to the repository alongside their `.ts` sources. This task modernizes the build pipeline:

1. Move compiled output out of the source tree (into a `dist/` or `out/` directory).
2. Stop committing compiled JS files to the repository.
3. Add source maps for debugging.
4. Optionally add a bundler for the renderer process.

This task is lower priority than tasks 01–10 and can be done last without blocking other work. It's primarily a developer experience improvement.

## Motivation

- Compiled `.js` files committed alongside `.ts` sources create noise in diffs and PRs.
- `main.js`, `browser-config.js`, `nyaovim-app.js` etc. have no meaningful history in git — they are always derived from the `.ts` files.
- An `outDir` config reduces clutter in the source directories.
- Source maps already exist (`.js.map` files) but are stored in the wrong location.

## Current Build Configuration

`main/tsconfig.json` and `renderer/tsconfig.json` both lack an `outDir` — TypeScript outputs `.js` files in the same directory as `.ts` files.

```json
// main/tsconfig.json (current — no outDir)
{
  "compilerOptions": {
    "target": "ES2015",
    "module": "CommonJS",
    "sourceMap": true
  },
  "files": ["browser-config.ts", "menu.ts", "main.ts"]
}
```

## Steps

### Step 1 — Add `outDir` to TypeScript configs

Update `main/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "outDir": "../out/main",
    "rootDir": ".",
    "sourceMap": true,
    "declaration": false
  },
  "files": ["browser-config.ts", "menu.ts", "main.ts", "preload.ts"]
}
```

Update `renderer/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "outDir": "../out/renderer",
    "rootDir": ".",
    "sourceMap": true
  },
  "files": ["nyaovim-app.ts", "main.ts"]
}
```

Output will be:
```
out/
├── main/
│   ├── main.js
│   ├── browser-config.js
│   ├── menu.js
│   └── preload.js
└── renderer/
    ├── nyaovim-app.js
    └── main.js
```

### Step 2 — Update `package.json` main entry point

The Electron `main` field in `package.json` must point to the compiled output:

```json
{
  "main": "out/main/main.js"
}
```

### Step 3 — Update `renderer/main.html` script paths

The HTML file loads compiled renderer JS. Update paths to use the `out/renderer/` location:

```html
<!-- BEFORE -->
<script src="main.js"></script>

<!-- AFTER -->
<script src="../out/renderer/main.js"></script>
```

Or change the HTML file's loading approach to use Electron's `file://` protocol with proper paths.

### Step 4 — Update `preload.ts` path in `BrowserWindow` creation

```typescript
// In main/browser-config.ts or main.ts:
webPreferences: {
    preload: path.join(__dirname, 'preload.js'),  // __dirname is out/main/
    // ...
}
```

Since `preload.js` will be in `out/main/`, and `__dirname` in the compiled code points to `out/main/`, this should work automatically.

### Step 5 — Remove compiled files from git and `.gitignore` them

```bash
git rm --cached main/main.js main/main.js.map
git rm --cached main/browser-config.js main/browser-config.js.map
git rm --cached main/menu.js main/menu.js.map
git rm --cached renderer/main.js renderer/main.js.map
git rm --cached renderer/nyaovim-app.js renderer/nyaovim-app.js.map
```

Add to `.gitignore`:
```
# Compiled TypeScript output
out/
main/*.js
main/*.js.map
renderer/*.js
renderer/*.js.map
test/**/*.js
test/**/*.js.map
```

### Step 6 — Update `electron-packager` to include `out/`

The packager needs to include the compiled output. Update the release script or `package.json` packager config:

```json
{
  "build": {
    "files": [
      "out/**/*",
      "renderer/main.html",
      "resources/**/*",
      "runtime/**/*"
    ]
  }
}
```

Or update the `make-release.sh` script to pass `--ignore` patterns that exclude source `.ts` files from the package.

### Step 7 — Update test tsconfig

```json
// test/tsconfig.json
{
  "compilerOptions": {
    "outDir": "../out/test",
    "rootDir": "."
  }
}
```

Update the `smoke-test` script:
```json
"smoke-test": "npm run build:test && npx playwright test out/test/smoke"
```

### Step 8 — Add a `clean` script

```json
"clean": "rm -rf out/ bower_components/"
```

(Remove `bower_components` once task 03 is done.)

### Step 9 — (Optional) Evaluate adding Vite for the renderer

For the renderer process, a bundler like **Vite** could provide:
- HMR (hot module reload) during development
- Tree-shaking for smaller bundles
- Better handling of ES modules from npm (Lit, etc.)

The main process should stay as `tsc`-compiled CommonJS (bundling is counterproductive for Electron main process code).

If Vite is adopted for the renderer:

```bash
npm install --save-dev vite @vitejs/plugin-electron
```

Create `vite.config.ts`:
```typescript
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        outDir: 'out/renderer',
        rollupOptions: {
            input: 'renderer/main.html',
            external: ['electron'],
        },
    },
});
```

Update build scripts:
```json
"build:renderer": "vite build",
"build:renderer:watch": "vite build --watch"
```

This is optional and adds complexity. Given the small size of the renderer code, it may not be worth the added tooling overhead.

## Verification

```bash
npm run clean
npm run build
npm run app          # App must launch correctly
npm run smoke-test   # Tests must pass
```

Verify the `out/` directory is populated and no `.js` files exist in `main/` or `renderer/`.

## References

- [TypeScript `outDir` documentation](https://www.typescriptlang.org/tsconfig#outDir)
- [Vite Electron plugin](https://github.com/electron-vite/vite-plugin-electron)
- [Electron Forge build tool](https://www.electronforge.io/) — a more opinionated alternative that handles packaging, code signing, and publishing
