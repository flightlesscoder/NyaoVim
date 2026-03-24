**Status:** pending

# 02 — Migrate from `electron.remote` to Preload Scripts + `contextBridge`

## Overview

NyaoVim uses `electron.remote` in 10+ places across `renderer/main.ts` and `renderer/nyaovim-app.ts`. The `remote` module was **deprecated in Electron 12** and **removed in Electron 14**. This task replaces all `remote` usage with the modern, secure pattern: a preload script that exposes a typed API to the renderer via `contextBridge`.

This task must be completed **before** upgrading Electron past v13 (task 01).

## Motivation

- **Hard breakage**: The app does not run at all on Electron 14+ without this change.
- **Security**: `remote` enabled arbitrary IPC calls from the renderer with no sandboxing. `contextBridge` enforces an explicit, minimal API surface.
- **Architecture**: Modern Electron enforces process isolation. Preload scripts are the correct boundary between privileged (main process) code and untrusted (renderer) code.

## Current `electron.remote` Usage Inventory

All uses found in `renderer/main.ts` and `renderer/nyaovim-app.ts`:

| API Called | Location | Purpose |
|-----------|----------|---------|
| `remote.getGlobal('nyaovimrc_path')` | renderer/main.ts:19 | Read config path from main process |
| `remote.getCurrentWindow()` | nyaovim-app.ts | Window management |
| `remote.getCurrentWebContents()` | nyaovim-app.ts | Web contents reference |
| `remote.app.addRecentDocument()` | nyaovim-app.ts | Recent docs on macOS |
| `remote.process.argv` | nyaovim-app.ts | CLI args |
| `remote.app.getVersion()` | nyaovim-app.ts | App version for About dialog |
| `remote.app.on('open-file', ...)` | nyaovim-app.ts | macOS open-file event |

## Steps

### Step 1 — Create `main/preload.ts`

Create a new file `main/preload.ts` that exposes exactly the APIs the renderer needs:

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('nyaovimBridge', {
    // Config path (set by main process before window loads)
    getNyaovimrcPath: (): string => ipcRenderer.sendSync('get-nyaovimrc-path'),

    // Window management
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    focus: () => ipcRenderer.send('window-focus'),
    isFocused: (): Promise<boolean> => ipcRenderer.invoke('window-is-focused'),

    // App info
    getVersion: (): string => ipcRenderer.sendSync('get-version'),
    getArgv: (): string[] => ipcRenderer.sendSync('get-argv'),
    addRecentDocument: (path: string) => ipcRenderer.send('add-recent-document', path),

    // Open-file event from macOS
    onOpenFile: (callback: (filePath: string) => void) => {
        ipcRenderer.on('open-file', (_event, filePath: string) => callback(filePath));
    },

    // Browser window method proxy (for 'nyaovim:browser-window' RPC)
    invokeBrowserWindowMethod: (method: string, args: unknown[]): Promise<unknown> =>
        ipcRenderer.invoke('browser-window-method', method, args),
});
```

Add a type declaration file `renderer/preload.d.ts` so the renderer's TypeScript code can use the bridge with proper types:

```typescript
interface NyaovimBridge {
    getNyaovimrcPath(): string;
    minimize(): void;
    maximize(): void;
    focus(): void;
    isFocused(): Promise<boolean>;
    getVersion(): string;
    getArgv(): string[];
    addRecentDocument(path: string): void;
    onOpenFile(callback: (filePath: string) => void): void;
    invokeBrowserWindowMethod(method: string, args: unknown[]): Promise<unknown>;
}

declare global {
    interface Window {
        nyaovimBridge: NyaovimBridge;
    }
}
```

### Step 2 — Handle IPC in `main/main.ts`

Add IPC handlers in the main process to respond to the preload's requests:

```typescript
import { ipcMain, app, BrowserWindow } from 'electron';

// Called synchronously from preload during window init
ipcMain.on('get-nyaovimrc-path', (event) => {
    event.returnValue = global.nyaovimrc_path;  // set earlier in main.ts
});

ipcMain.on('get-version', (event) => {
    event.returnValue = app.getVersion();
});

ipcMain.on('get-argv', (event) => {
    event.returnValue = process.argv;
});

ipcMain.on('add-recent-document', (_event, path: string) => {
    app.addRecentDocument(path);
});

ipcMain.on('window-minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on('window-maximize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.maximize();
});

ipcMain.on('window-focus', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.focus();
});

ipcMain.handle('window-is-focused', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isFocused() ?? false;
});

ipcMain.handle('browser-window-method', (event, method: string, args: unknown[]) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || typeof (win as any)[method] !== 'function') {
        throw new Error(`Invalid BrowserWindow method: ${method}`);
    }
    // Allowlist safe methods only
    const ALLOWED_METHODS = ['setTitle', 'setProgressBar', 'flashFrame', 'setFullScreen'];
    if (!ALLOWED_METHODS.includes(method)) {
        throw new Error(`BrowserWindow method not permitted: ${method}`);
    }
    return (win as any)[method](...args);
});

// Forward macOS open-file events to the renderer
app.on('open-file', (event, path) => {
    event.preventDefault();
    mainWindow?.webContents.send('open-file', path);
});
```

### Step 3 — Update `BrowserWindow` creation to use preload

In `main/browser-config.ts` or wherever the window is created:

```typescript
import path from 'path';

const win = new BrowserWindow({
    // ...existing options...
    webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
    },
});
```

### Step 4 — Update renderer code to use the bridge

Replace all `remote.*` calls in `renderer/nyaovim-app.ts` and `renderer/main.ts`:

```typescript
// OLD
import { remote } from 'electron';
const nyaovimrc_path = remote.getGlobal('nyaovimrc_path');
const win = remote.getCurrentWindow();
remote.app.addRecentDocument(path);

// NEW
const nyaovimrc_path = window.nyaovimBridge.getNyaovimrcPath();
window.nyaovimBridge.addRecentDocument(path);
// window management goes through the bridge
```

Remove all `import { remote } from 'electron'` statements from renderer files. The renderer should not import from `'electron'` at all after this change.

### Step 5 — Add `main/preload.ts` to the main tsconfig

In `main/tsconfig.json`, add `preload.ts` to the `files` array:

```json
{
  "files": ["browser-config.ts", "menu.ts", "main.ts", "preload.ts"]
}
```

### Step 6 — Update build scripts

The preload script must be in the same directory as `main.js` after compilation. Since the tsconfig for `main/` outputs to the same directory, this should work automatically. Verify the compiled `preload.js` appears alongside `main.js`.

### Step 7 — Verify E2E tests pass

```bash
npm run build
npm run smoke-test
```

Update `test/helper/nyaovim.ts` if any test helpers reference `remote`.

## References

- [Electron contextBridge docs](https://www.electronjs.org/docs/latest/api/context-bridge)
- [Electron preload scripts guide](https://www.electronjs.org/docs/latest/tutorial/tutorial-preload)
- [Electron remote module removal](https://www.electronjs.org/docs/latest/breaking-changes#removed-remote-module-electron-14)
- [Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)
