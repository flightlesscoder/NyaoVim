import {join} from 'path';
import {stat, writeFileSync} from 'fs';
import {app, BrowserWindow, shell, nativeImage, ipcMain} from 'electron';
import {sync as mkdirpSync} from 'mkdirp';
import setMenu from './menu';
import BrowserConfig from './browser-config';

if (process.argv.indexOf('--help') !== -1) {
    console.log(`OVERVIEW: NyaoVim; Web-enhanced Extensible Neovim Frontend

USAGE: nyaovim [options] [neovim args...]

OPTIONS:
  --no-detach : Don't detach the editor process
  --help      : Show this help
  --version   : Show versions of NyaoVim, Electron, Chrome, Node.js, and V8
`);
    app.exit();
}

if (process.argv.indexOf('--version') !== -1) {
    const vs: {[n: string]: string} = process.versions as any;
    const versions = ['electron', 'chrome', 'node', 'v8'].map((n: string) => `  ${n} : ${vs[n]}`).join('\n');
    console.log(`${app.getName()} version ${app.getVersion()}
${versions}
`);
    app.exit();
}

process.on('unhandledRejection', (reason: unknown, p: Promise<unknown>) => {
    console.error('Fatal: Unhandled rejection at: Promise', p, 'Reason:', reason);
});

const is_run_from_npm_package_on_darwin =
    app.getAppPath().indexOf('/NyaoVim.app/') === -1;

const config_dir_name =
        process.platform !== 'darwin' ?
            app.getPath('appData') :
            process.env.XDG_CONFIG_HOME || join(process.env.HOME ?? app.getPath('home'), '.config');

global.config_dir_path = join(config_dir_name, 'nyaovim');
global.nyaovimrc_path = join(global.config_dir_path, 'nyaovimrc.html');

// Request single-instance lock early (before 'ready').
// The result is passed to BrowserConfig.configSingletonWindow().
const singleInstanceLockAcquired = app.requestSingleInstanceLock();

function exists(path: string) {
    return new Promise<boolean>(resolve => {
        stat(path, (err, stats) => {
            if (err) {
                resolve(false);
                return;
            }
            resolve(stats.isFile() || stats.isDirectory());
        });
    });
}

function prepareDefaultNyaovimrc() {
    console.log('Generate default nyaovimrc at ' + global.nyaovimrc_path);

    return exists(global.config_dir_path).then(e => {
        if (!e) {
            mkdirpSync(global.config_dir_path);
        }
    }).then(() => {
        const contents =
`<dom-module id="nyaovim-app">
  <template>
    <style>
      /* CSS configurations here */
    </style>

    <!-- Component tags here -->
    <neovim-editor id="nyaovim-editor" argv="[[argv]]" font="monospace"></neovim-editor>
  </template>
</dom-module>
`;
        writeFileSync(global.nyaovimrc_path, contents, 'utf8');
    });
}

const ensure_nyaovimrc = exists(global.nyaovimrc_path).then((e: boolean) => {
    if (!e) {
        return prepareDefaultNyaovimrc();
    } else {
        // Note: This line needs because of TS7030 error
        return undefined;
    }
}).catch(err => console.error(err));

const browser_config = new BrowserConfig();
const prepare_browser_config
    = browser_config.loadFrom(global.config_dir_path)
        .catch(err => console.error(err));

function startMainWindow() {
    const index_html = 'file://' + join(__dirname, '..', 'renderer', 'main.html');

    const default_config = {
        width: 800,
        height: 600,
        useContentSize: true,
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: true,
        },
        icon: nativeImage.createFromPath(join(__dirname, '..', 'resources', 'icon', 'nyaovim-logo.png')),
    } as Electron.BrowserWindowConstructorOptions;

    const user_config = browser_config.applyToOptions(default_config);

    let win = new BrowserWindow(user_config);

    const already_exists = browser_config.configSingletonWindow(win, singleInstanceLockAcquired);
    if (already_exists) {
        app.quit();
        return null;
    }

    browser_config.setupWindowState(win);
    if (browser_config.loaded_config !== null && browser_config.loaded_config.show_menubar === false) {
        win.setMenuBarVisibility(false);
    }

    win.once('closed', function() {
        win = null;
    });

    win.loadURL(index_html);
    if (process.env.NODE_ENV !== 'production' && is_run_from_npm_package_on_darwin) {
        win.webContents.openDevTools({mode: 'detach'});
    }

    return win;
}

// IPC handlers for the renderer bridge (preload.ts)
ipcMain.on('get-nyaovimrc-path', (event: Electron.IpcMainEvent) => { event.returnValue = global.nyaovimrc_path; });
ipcMain.on('get-version', (event: Electron.IpcMainEvent) => { event.returnValue = app.getVersion(); });
ipcMain.on('get-argv', (event: Electron.IpcMainEvent) => { event.returnValue = process.argv; });
ipcMain.on('add-recent-document', (_event: Electron.IpcMainEvent, path: string) => { app.addRecentDocument(path); });
ipcMain.on('shell-beep', () => { shell.beep(); });
ipcMain.on('window-set-represented-filename', (event: Electron.IpcMainEvent, path: string) => {
    BrowserWindow.fromWebContents(event.sender)?.setRepresentedFilename(path);
});
ipcMain.on('window-close', (event: Electron.IpcMainEvent) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
});
ipcMain.on('window-open-devtools', (event: Electron.IpcMainEvent, mode: string) => {
    (event.sender as any).openDevTools({mode});
});
ipcMain.on('browser-window-method', (event: Electron.IpcMainEvent, method: string, args: unknown[]) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) { return; }
    const ALLOWED_METHODS = ['setTitle', 'setProgressBar', 'flashFrame', 'setFullScreen', 'minimize', 'maximize', 'focus', 'restore'];
    if (!ALLOWED_METHODS.includes(method)) {
        console.error(`browser-window-method: blocked method '${method}'`);
        return;
    }
    (win as any)[method](...(args as unknown[]));
});

app.once('window-all-closed', () => app.quit());
app.on('open-url', (_e, u: string) => {
    shell.openExternal(u);
});
app.once('will-finish-launching', function() {
    // we use once here because only the first open-file event might be missed by nyaovim-app
    app.once('open-file', (_e, p: string) => {
        // open-file event might be sent before ready event is emitted
        // put it in argv to let nyaovim-app to pick it up later
        process.argv.push(p);
        _e.preventDefault();
    });
});

let mainWindow: Electron.BrowserWindow | null = null;

app.once(
    'ready',
    () => {
        if (process.platform === 'darwin' && is_run_from_npm_package_on_darwin) {
            // XXX:
            // app.dock.setIcon() is not defined in github-electron.d.ts yet.
            (app.dock as any).setIcon(join(__dirname, '..', 'resources', 'icon', 'nyaovim-logo.png'));
        }

        Promise.all([
            ensure_nyaovimrc,
            prepare_browser_config,
        ]).then(() => {
            const w = startMainWindow();
            if (w !== null) {
                mainWindow = w;
                setMenu(w);
                // Forward macOS open-file events to the renderer via IPC
                app.on('open-file', (_e, p: string) => {
                    _e.preventDefault();
                    mainWindow?.webContents.send('open-file', p);
                });
            }
        });
    },
);
