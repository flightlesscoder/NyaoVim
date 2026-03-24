**Status:** pending

# 08 — Fix Security Vulnerabilities and Dangerous Patterns

## Overview

A code audit of `renderer/nyaovim-app.ts` and `main/main.ts` reveals several intentional but dangerous patterns that can be hardened without breaking the plugin API. This task addresses injection risks, unsafe IPC patterns, and missing security boundaries.

## Motivation

NyaoVim's core value proposition is extensibility — Neovim plugins can inject JavaScript and load node modules into the renderer. This intentional design creates attack surface. The goal here is not to remove the extensibility but to:
1. Add path validation and allowlisting where possible.
2. Fix unintentional injection vectors (e.g., the vim command injection via drag-and-drop filenames).
3. Add security logging so suspicious calls are visible.
4. Enforce the Content Security Policy.

## Identified Issues

### Issue 1 — Vim Command Injection via Drag-and-Drop (UNINTENTIONAL)

**Location**: `renderer/nyaovim-app.ts`, drop event handler

**Current code**:
```typescript
element.addEventListener('drop', e => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) {
        client.command('edit! ' + f.path);
    }
});
```

**Risk**: A filename containing `|` or `<CR>` can inject arbitrary Vim commands. For example, a file named `foo | !rm -rf ~` would execute shell commands through Vim's `!` command.

**Fix**: Escape the path before passing it to Vim's `edit` command. Vim uses backlash-escaping for special characters in command arguments:

```typescript
function escapeVimPath(filePath: string): string {
    // Escape characters special to Vim command-line: space, |, #, %, backslash
    return filePath.replace(/[\\ |#%]/g, '\\$&');
}

element.addEventListener('drop', e => {
    e.preventDefault();
    const f = e.dataTransfer?.files[0];
    if (f) {
        client.command('edit! ' + escapeVimPath(f.path));
    }
});
```

### Issue 2 — Dynamic `require()` Loads Arbitrary Modules (INTENTIONAL but should be validated)

**Location**: `renderer/nyaovim-app.ts`:
```typescript
'nyaovim:require-script-file': (script_path: string) => {
    require(script_path);
}
```

**Risk**: Any Neovim plugin can load any `.js` file from disk with full Node.js privileges.

**Hardening**: Add path validation and logging. Since this is intentional extensibility, we cannot remove it, but we can:

```typescript
'nyaovim:require-script-file': (script_path: string) => {
    if (typeof script_path !== 'string' || script_path.trim() === '') {
        console.error('nyaovim:require-script-file: Invalid path', script_path);
        return;
    }
    console.log('nyaovim: Loading script', script_path);
    try {
        require(script_path);
    } catch (e) {
        console.error('nyaovim:require-script-file: Failed to load', script_path, e);
    }
}
```

After completing task 02 (contextBridge migration), consider whether `require()` in the renderer should be routed through an IPC call to the main process instead, giving better audit logging.

### Issue 3 — `eval()` Executes Arbitrary Code from Neovim (INTENTIONAL)

**Location**: `renderer/nyaovim-app.ts`:
```typescript
'nyaovim:execute-javascript': (code: string) => {
    try {
        /* tslint:disable */
        eval(code);
        /* tslint:enable */
    } catch (e) {
        console.error('While executing javascript:', e, ' Code:', code);
    }
}
```

**Hardening**: This is intentional. Add a type guard and logging:

```typescript
'nyaovim:execute-javascript': (code: string) => {
    if (typeof code !== 'string') {
        console.error('nyaovim:execute-javascript: Expected string, got', typeof code);
        return;
    }
    if (code.length > 1_000_000) {
        console.error('nyaovim:execute-javascript: Code too large, refusing to eval');
        return;
    }
    console.log('nyaovim: Evaluating JavaScript (%d chars)', code.length);
    try {
        // eslint-disable-next-line no-eval
        eval(code);  // Intentional: plugin API design
    } catch (e) {
        console.error('While executing javascript:', e);
    }
}
```

**Future consideration**: Replace `eval()` with a sandboxed iframe or Worker for untrusted code. This is a larger architectural change for a future task.

### Issue 4 — Unrestricted `BrowserWindow` Method Proxy (INTENTIONAL but dangerous)

**Location**: `renderer/nyaovim-app.ts`:
```typescript
'nyaovim:browser-window': (method: string, args: RPCValue[]) => {
    try {
        (ThisBrowserWindow as any)[method].apply(ThisBrowserWindow, args);
    } catch (e) {
        console.error(e);
    }
}
```

**Risk**: Calling `loadURL('javascript:alert(1)')` or `loadURL('http://evil.com')` via this proxy could redirect the app to untrusted content.

**Fix**: Implement an allowlist of permitted methods:

```typescript
const ALLOWED_BROWSER_WINDOW_METHODS = new Set([
    'setTitle',
    'setProgressBar',
    'flashFrame',
    'setFullScreen',
    'isFullScreen',
    'minimize',
    'maximize',
    'restore',
    'setAlwaysOnTop',
    'center',
    'setPosition',
    'setSize',
    'setOpacity',
    'setHasShadow',
]);

'nyaovim:browser-window': (method: string, args: RPCValue[]) => {
    if (!ALLOWED_BROWSER_WINDOW_METHODS.has(method)) {
        console.error(`nyaovim:browser-window: Method '${method}' is not permitted`);
        return;
    }
    try {
        (ThisBrowserWindow as any)[method].apply(ThisBrowserWindow, args);
    } catch (e) {
        console.error('Error calling BrowserWindow.' + method, e);
    }
}
```

### Issue 5 — Global Exposure of App Instance (DEBUGGING ARTIFACT)

**Location**: `renderer/nyaovim-app.ts`:
```typescript
(global as any).hello = this;
```

**Risk**: Exposes the entire NyaovimApp component instance on the global `window` object, giving any injected script (from `eval()` or `require()`) access to the component's internal state.

**Fix**: Remove this line entirely. If it was for debugging, the browser DevTools console provides equivalent access during development via `document.querySelector('nyaovim-app')`.

```typescript
// REMOVE:
(global as any).hello = this;
```

### Issue 6 — Silent Promise Rejection

**Location**: `renderer/nyaovim-app.ts`:
```typescript
client.subscribe(name).catch();
```

**Fix**: Log subscription failures:

```typescript
client.subscribe(name).catch((err: unknown) => {
    console.error('Failed to subscribe to nvim event:', name, err);
});
```

### Issue 7 — Unmanaged Event Listeners (Memory Leak)

**Location**: `renderer/nyaovim-app.ts`, existing TODO comment:
```typescript
// TODO: Remove all listeners when detached
```

**Fix**: Store listener references and remove them in `disconnectedCallback()`:

```typescript
private readonly _ipcListeners: Array<() => void> = [];

connectedCallback() {
    super.connectedCallback();
    const onOpenFile = (event: Event, path: string) => { /* ... */ };
    ipcRenderer.on('open-file', onOpenFile);
    this._ipcListeners.push(() => ipcRenderer.removeListener('open-file', onOpenFile));
}

disconnectedCallback() {
    super.disconnectedCallback();
    for (const remove of this._ipcListeners) {
        remove();
    }
    this._ipcListeners.length = 0;
}
```

(After task 02, `ipcRenderer` calls are replaced by the contextBridge — update accordingly.)

### Issue 8 — Add Content Security Policy Header

After task 02 enables `contextIsolation`, add a CSP meta tag to `renderer/main.html` to prevent XSS in injected HTML:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'">
```

Note: `'unsafe-eval'` is required for the intentional `eval()` plugin API (Issue 3). Document this in the project's security notes.

## Testing

After each fix, run the smoke tests:
```bash
npm run build && npm run smoke-test
```

Also manually test:
- Drag a file with special characters in its name into the editor
- Verify the `nyaovim:browser-window` block correctly rejects unpermitted methods
- Verify `hello` global is no longer present in the browser console

## References

- [Electron Security Recommendations](https://www.electronjs.org/docs/latest/tutorial/security)
- [Vim special characters in commands](https://vimhelp.org/cmdline.txt.html#cmdline-special)
- [OWASP Injection Prevention](https://owasp.org/www-community/Injection_Theory)
