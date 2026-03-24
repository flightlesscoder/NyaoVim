interface NyaovimBridge {
    // Config / app info
    getNyaovimrcPath(): string;
    getVersion(): string;
    getArgv(): string[];

    // Recent documents (macOS)
    addRecentDocument(path: string): void;

    // Window management
    setRepresentedFilename(path: string): void;
    windowClose(): void;
    openDevTools(mode: string): void;

    // Shell
    beep(): void;

    // BrowserWindow method proxy
    invokeBrowserWindowMethod(method: string, args: unknown[]): void;

    // IPC events from main process
    onExecCommands(callback: (cmds: string[]) => void): void;
    onCopy(callback: () => void): void;
    onCut(callback: () => void): void;
    onPaste(callback: () => void): void;
    onSelectAll(callback: () => void): void;
    onOpenFile(callback: (filePath: string) => void): void;
}

declare global {
    interface Window {
        nyaovimBridge: NyaovimBridge;
    }
}
