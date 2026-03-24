import {contextBridge, ipcRenderer, IpcRendererEvent} from 'electron';

// Expose a typed, minimal API surface to the renderer process.
// This replaces all electron.remote usage and is the sole communication
// channel between the renderer and the main process.
contextBridge.exposeInMainWorld('nyaovimBridge', {
    // --- Config / app info ---
    getNyaovimrcPath: (): string => ipcRenderer.sendSync('get-nyaovimrc-path') as string,
    getVersion: (): string => ipcRenderer.sendSync('get-version') as string,
    getArgv: (): string[] => ipcRenderer.sendSync('get-argv') as string[],

    // --- Recent documents (macOS) ---
    addRecentDocument: (path: string): void => { ipcRenderer.send('add-recent-document', path); },

    // --- Window management ---
    setRepresentedFilename: (path: string): void => { ipcRenderer.send('window-set-represented-filename', path); },
    windowClose: (): void => { ipcRenderer.send('window-close'); },
    openDevTools: (mode: string): void => { ipcRenderer.send('window-open-devtools', mode); },

    // --- Shell ---
    beep: (): void => { ipcRenderer.send('shell-beep'); },

    // --- BrowserWindow method proxy (for 'nyaovim:browser-window' plugin RPC) ---
    invokeBrowserWindowMethod: (method: string, args: unknown[]): void => {
        ipcRenderer.send('browser-window-method', method, args);
    },

    // --- IPC events forwarded from main process ---
    onExecCommands: (callback: (cmds: string[]) => void): void => {
        ipcRenderer.on('nyaovim:exec-commands', (_event: IpcRendererEvent, cmds: string[]) => callback(cmds));
    },
    onCopy: (callback: () => void): void => {
        ipcRenderer.on('nyaovim:copy', () => callback());
    },
    onCut: (callback: () => void): void => {
        ipcRenderer.on('nyaovim:cut', () => callback());
    },
    onPaste: (callback: () => void): void => {
        ipcRenderer.on('nyaovim:paste', () => callback());
    },
    onSelectAll: (callback: () => void): void => {
        ipcRenderer.on('nyaovim:select-all', () => callback());
    },
    onOpenFile: (callback: (filePath: string) => void): void => {
        ipcRenderer.on('open-file', (_event: IpcRendererEvent, filePath: string) => callback(filePath));
    },
});
