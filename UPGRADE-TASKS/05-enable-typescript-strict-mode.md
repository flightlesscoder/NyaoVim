**Status:** pending

# 05 — Re-enable TypeScript Strict Mode

## Overview

When TypeScript was upgraded from 2.8.3 to 6.0.2 (commit `b105905`), several strict compiler flags were **disabled** to allow the build to succeed without addressing the underlying type issues:

```json
"strictNullChecks": false,
"strictPropertyInitialization": false
```

Additionally, `skipLibCheck: true` was added. This task re-enables full strict mode and fixes the underlying type errors, restoring type safety across the codebase.

## Motivation

- `strictNullChecks: false` means TypeScript does not warn when `null` or `undefined` is used where a value is expected — one of the most common sources of runtime crashes.
- `strictPropertyInitialization: false` allows class properties to be declared but never initialized, which is a common cause of `undefined is not a function` errors.
- With TypeScript 6, strict mode catches significantly more issues than it did in TypeScript 2.x.
- The codebase is small (~6 source files), so the remediation effort is bounded.

## Current Relaxed Flags

In all `tsconfig.json` files (`main/`, `renderer/`):

```json
{
  "compilerOptions": {
    "strictNullChecks": false,
    "strictPropertyInitialization": false,
    "skipLibCheck": true
  }
}
```

The test `tsconfig.json` already has `strictNullChecks: true` — so the test code is already strict.

## Steps

### Step 1 — Enable strict mode incrementally

Add `"strict": true` to both `main/tsconfig.json` and `renderer/tsconfig.json`. This enables:
- `strictNullChecks`
- `strictPropertyInitialization`
- `noImplicitAny`
- `strictFunctionTypes`
- `strictBindCallApply`
- `strictBuiltinIteratorReturn`
- `noImplicitThis`
- `alwaysStrict`

```json
{
  "compilerOptions": {
    "strict": true,
    "skipLibCheck": false
  }
}
```

### Step 2 — Run the compiler and collect errors

```bash
npm run build 2>&1 | head -100
```

Note every error file and line. Expected categories:

#### a) `strictNullChecks` — possibly undefined/null values

```typescript
// Example error: Object is possibly 'undefined'
const win = BrowserWindow.fromWebContents(event.sender);
win.setTitle('hello');  // ERROR: win could be undefined

// Fix: add null check
const win = BrowserWindow.fromWebContents(event.sender);
if (!win) return;
win.setTitle('hello');
```

#### b) `strictPropertyInitialization` — uninitialized class properties

In `renderer/nyaovim-app.ts` (Polymer element), properties are declared with Polymer's `properties()` getter rather than in the constructor:

```typescript
// ERROR: Property 'width' has no initializer and is not definitely assigned
width: number;

// Fix option A: add definite assignment assertion (short-term)
width!: number;

// Fix option B: initialize with a default value (preferred)
width: number = 800;

// Fix option C: mark optional
width?: number;
```

#### c) `(process as any).on(...)` in `main/main.ts`

This was cast to `any` as a workaround for a TypeScript 6 / @types/node incompatibility. After upgrading `@types/node` to v22 (task 01, Step 7), the overload should be available:

```typescript
// Was:
(process as any).on('unhandledRejection', handler);

// Should become (after @types/node update):
process.on('unhandledRejection', handler);
```

#### d) `client.eval()` callback type in `test/smoke/startup.ts`

This was changed to `(value: any)` as a temporary workaround:

```typescript
// Was:
client.eval('1+1', (value: any) => {
// ...
```

After resolving the promised-neovim-client types (or updating the package), restore the proper type.

### Step 3 — Fix `skipLibCheck`

With `skipLibCheck: true`, TypeScript does not check `.d.ts` files. Setting it to `false` may surface errors in `@types/*` packages. If third-party type packages have errors:

1. First try upgrading the offending `@types/*` package.
2. If still broken, use a targeted suppression in the project's `lib.d.ts` rather than disabling `skipLibCheck` globally.
3. As a last resort, keep `skipLibCheck: true` only in the tsconfig of the directory that sources the broken types.

### Step 4 — Address `(win.webContents as any).isFocused()` casts

In `main/menu.ts`, `isFocused()` is cast to `any`. After upgrading `electron` types, check if `isFocused()` is now properly typed on `WebContents`:

```typescript
// Current
(win.webContents as any).isFocused()

// After Electron type upgrade, may become:
win.webContents.isFocused()
// or use the BrowserWindow method directly:
win.isFocused()
```

### Step 5 — Validate final build

```bash
npm run build
npm run lint
npm run smoke-test
```

All three must pass without errors or warnings.

### Step 6 — Enable stricter TSLint/ESLint rules (after task 04)

Once strict mode is enabled, update the ESLint config to escalate warnings to errors:

```javascript
'@typescript-eslint/no-explicit-any': 'error',  // was 'warn'
'@typescript-eslint/no-unsafe-assignment': 'error',
```

## Expected Effort

The codebase is ~700 lines of TypeScript across 6 files. Based on the audit findings, expected issues:

| File | Expected Issues |
|------|----------------|
| main/main.ts | ~3–5 (process.on, window null checks) |
| main/browser-config.ts | ~5–8 (window state, BrowserWindow calls) |
| main/menu.ts | ~5–10 (menu item callbacks, webContents casts) |
| renderer/nyaovim-app.ts | ~15–25 (property initializers, client types) |
| renderer/main.ts | ~2–3 (remote migration overlap) |

## References

- [TypeScript strict mode docs](https://www.typescriptlang.org/tsconfig#strict)
- [TypeScript 6 release notes](https://devblogs.microsoft.com/typescript/)
- [strictNullChecks migration guide](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
