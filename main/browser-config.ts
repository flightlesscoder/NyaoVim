import {join} from 'path';
import {readFileSync} from 'fs';
import {app} from 'electron';
import extend = require('deep-extend');
import windowStateKeeper = require('electron-window-state');

export interface BrowserConfigJson {
    remember_window_state: boolean;
    window_options: Electron.BrowserWindowConstructorOptions;
    single_instance: boolean;
    show_menubar: boolean;
}

export default class BrowserConfig {
    loaded_config: BrowserConfigJson | null;
    window_state: ReturnType<typeof windowStateKeeper> | null;

    constructor() {
        this.loaded_config = null;
        this.window_state = null;
    }

    loadFrom(config_dir: string) {
        return new Promise<void>(resolve => {
            try {
                const config_file = join(config_dir, 'browser-config.json');
                const content = readFileSync(config_file, 'utf8');
                this.loaded_config = JSON.parse(content);
            } catch {
                // Do nothing
            }
            resolve();
        });
    }

    applyToOptions(opt: Electron.BrowserWindowConstructorOptions): Electron.BrowserWindowConstructorOptions {
        if (typeof this.loaded_config !== 'object' || this.loaded_config === null) {
            return opt;
        }

        if (typeof this.loaded_config.window_options === 'object') {
            extend(opt, this.loaded_config.window_options);
        }

        if (this.loaded_config.remember_window_state) {
            const s = windowStateKeeper({
                defaultWidth: 1000,
                defaultHeight: 800,
                path: global.config_dir_path,
            });
            if (typeof s.x === 'number') {
                opt.x = s.x;
            }
            if (typeof s.y === 'number') {
                opt.y = s.y;
            }
            opt.width = s.width;
            opt.height = s.height;
            if (typeof s.isFullScreen === 'boolean') {
                opt.fullscreen = s.isFullScreen;
            }

            this.window_state = s;
        }

        return opt;
    }

    setupWindowState(win: Electron.BrowserWindow) {
        const s = this.window_state;
        if (s === null) {
            return null;
        }
        // Note:
        // Using 'resize' event instead of 'close' event because of
        // 'Object has been destroyed' error.
        // See https://github.com/rhysd/NyaoVim/pull/63
        win.on('resize', () => {
            s.saveState(win);
        });

        if (s.isMaximized) {
            win.maximize();
        }
        return s;
    }

    configSingletonWindow(win: Electron.BrowserWindow, lockAcquired: boolean) {
        if (this.loaded_config === null || !this.loaded_config.single_instance) {
            return false;
        }
        if (!lockAcquired) {
            // Another instance already holds the lock — this is the second instance
            return true;
        }
        // We're the first instance; handle subsequent launch attempts
        app.on('second-instance', (_event, argv: string[], cwd: string) => {
            if (win.isMinimized()) {
                win.restore();
            }
            win.focus();

            // Note: Omit Electron binary and NyaoVim directory
            const args = argv.slice(2);
            if (args.length !== 0) {
                win.webContents.send('nyaovim:exec-commands', [
                    'cd ' + cwd,
                    'args ' + args.join(' '),
                ]);
            }
        });
        return false;
    }
}
