**Status:** pending

# 12 — Update @types/node and Fix Node.js Compatibility

## Overview

The project currently pins `@types/node@^9.6.6`, which corresponds to Node.js 9 (EOL in June 2018). Modern Electron ships Node.js 22. Several workarounds were introduced to handle gaps between the old types and the actual runtime:

- `(process as any).on('unhandledRejection', ...)` — cast to `any` because the v9 types lack the correct overload
- Various other `as any` casts that may be resolvable with proper types

This task updates the Node.js type definitions and resolves the workarounds they enabled.

## Motivation

- `@types/node@9` is ~7 years out of date.
- Node.js APIs used by Electron 34 are typed in `@types/node@22`.
- Removing the `any` casts improves type safety and catches real bugs.
- Modern `@types/node` properly types `process.on('unhandledRejection')`, `process.on('uncaughtException')`, `Promise`, and async APIs.

## Steps

### Step 1 — Update `@types/node`

```bash
npm install --save-dev @types/node@^22
```

### Step 2 — Run the build and identify new errors

```bash
npm run build 2>&1
```

Expected categories of errors from the types update:

#### a) `process.on('unhandledRejection')` overload

In `main/main.ts`:
```typescript
// Current workaround
(process as any).on('unhandledRejection', (reason: Error, promise: Promise<any>) => {
    console.error('Unhandled rejection:', promise, 'reason:', reason);
});

// Fix: with @types/node@22, this is properly typed
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection:', promise, 'reason:', reason);
});
```

The `reason` type in the modern types is `unknown`, not `Error`. Update the handler accordingly:

```typescript
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    console.error('Unhandled rejection:', promise, 'reason:', reason);
});
```

#### b) Node.js built-in module imports

Check that all `import ... from 'path'`, `import ... from 'fs'`, etc. resolve correctly with the new types.

#### c) `__dirname` and `__filename`

These are globally available in CommonJS mode (`"module": "CommonJS"` in tsconfig). Ensure they are still typed after the `@types/node` update.

#### d) `Buffer` usage

If any `Buffer` calls exist, verify they use the non-deprecated static methods:
```typescript
// Deprecated
new Buffer(string);

// Modern
Buffer.from(string);
```

### Step 3 — Remove the `@types/react` phantom dependency

`@types/react@16` is installed but React is not used in this project. This is dead weight and may cause type conflicts:

```bash
npm uninstall @types/react
```

Run `npm run build` to confirm it is not actually needed.

### Step 4 — Audit remaining `as any` casts

After updating types, search for remaining `any` casts that may now be unnecessary:

```bash
grep -n "as any" main/*.ts renderer/*.ts
```

For each occurrence:
1. Remove the cast and check if TypeScript accepts it without errors.
2. If TypeScript rejects it, investigate whether the underlying code is correct or if there's a proper typed alternative.
3. If the cast is genuinely necessary (e.g., dynamic method invocation), add a comment explaining why.

Expected locations:
- `main/main.ts`: `(app.dock as any).setIcon(...)` — `app.dock` is typed in modern Electron, but `setIcon` may require checking
- `main/menu.ts`: `(win.webContents as any).isFocused()` — should be `win.isFocused()` after Electron upgrade
- `renderer/nyaovim-app.ts`: Various casts (some legitimate, some workarounds)

### Step 5 — Verify `lib.d.ts` files are still needed

Both `main/lib.d.ts` and `renderer/lib.d.ts` declare globals and polyfills. After updating types:

1. Check `main/lib.d.ts` — if it only declares things now covered by `@types/node@22`, delete it.
2. Check `renderer/lib.d.ts` — if it only declared Polymer-related types (covered by task 03's Lit migration), delete it.

### Step 6 — Update `target` and `lib` in tsconfig

With Node.js 22 (V8 12.4+), update the TypeScript compile target to take advantage of modern JavaScript features:

```json
// main/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "CommonJS",
    "moduleResolution": "bundler"
  }
}
```

```json
// renderer/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler"
  }
}
```

### Step 7 — Verify E2E tests

```bash
npm run build
npm run smoke-test
```

## Expected Outcome

- No more `(process as any).on(...)` casts
- `@types/node` matches the actual Node.js version in Electron
- Removal of phantom `@types/react`
- Fewer `any` casts throughout the codebase
- Cleaner TypeScript output targeting ES2022

## References

- [@types/node on npm](https://www.npmjs.com/package/@types/node)
- [Node.js 22 release notes](https://nodejs.org/en/blog/release/v22.0.0)
- [TypeScript target options](https://www.typescriptlang.org/tsconfig#target)
- [Electron Node.js version matrix](https://releases.electronjs.org/)
