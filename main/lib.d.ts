declare global {
    var config_dir_path: string;
    var nyaovimrc_path: string;

    namespace ElectronWindowState {
        interface WindowState {
            x: number;
            y: number;
            width: number;
            height: number;
            isMaximized: boolean;
            isFullScreen: boolean;
            manage(win: Electron.BrowserWindow): void;
            saveState(win: Electron.BrowserWindow): void;
        }
    }
}

// Forward-compat declarations for Electron APIs added after v1.x.
// These are used in preload.ts (contextBridge) and IPC handlers (IpcMainEvent).
declare module 'electron' {
    // contextBridge was added in Electron 5 (not present in 1.x types)
    interface ContextBridge {
        exposeInMainWorld(apiKey: string, api: Record<string, unknown>): void;
    }
    const contextBridge: ContextBridge;

    // IpcMainEvent type (may not exist in old Electron 1.x types)
    interface IpcMainEvent extends Event {
        returnValue: unknown;
        sender: Electron.WebContents;
        reply(...args: unknown[]): void;
    }
}

export {};
