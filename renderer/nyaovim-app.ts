import {LitElement, html, css} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {NeovimElement, Neovim} from 'neovim-component';
import {join, basename} from 'path';
import {readdirSync} from 'fs';
import {Nvim, RPCValue} from 'promised-neovim-client';

class ComponentLoader {
    initially_loaded: boolean;
    component_paths: string[];
    nyaovim_plugin_paths: string[];

    constructor() {
        this.initially_loaded = false;
        this.component_paths = [];
        this.nyaovim_plugin_paths = [];
    }

    loadComponent(path: string) {
        const link: HTMLLinkElement = document.createElement('link');
        link.rel = 'import';
        link.href = path;
        document.head.appendChild(link);
        this.component_paths.push(path);
    }

    loadPluginDir(dir: string) {
        const nyaovim_plugin_dir = join(dir, 'nyaovim-plugin');
        try {
            for (const entry of readdirSync(nyaovim_plugin_dir)) {
                if (entry.endsWith('.html')) {
                    this.loadComponent(join(nyaovim_plugin_dir, entry));
                }
            }
            this.nyaovim_plugin_paths.push(dir);
        } catch {
            // 'nyaovim-plugin' doesn't exist
        }
    }

    loadFromRTP(runtimepaths: string[]) {
        for (const rtp of runtimepaths) {
            this.loadPluginDir(rtp);
        }
    }
}

class RuntimeApi {
    private client: Nvim;

    constructor(private readonly definitions: {[name: string]: (...args: any[]) => void}) {
        this.client = null;
    }

    subscribe(client: Nvim) {
        client.on('notification', this.call.bind(this));
        for (const name in this.definitions) {
            client.subscribe(name).catch();
        }
        this.client = client;
    }

    unsubscribe() {
        if (this.client) {
            for (const name in this.definitions) {
                this.client.unsubscribe(name);
            }
        }
    }

    call(func_name: string, args: RPCValue[]) {
        const func = this.definitions[func_name];
        if (!func) {
            return null;
        }
        return func.apply(func, args);
    }
}

const component_loader = new ComponentLoader();
const bridge = window.nyaovimBridge;

function buildArgv(): string[] {
    // Handle the arguments of the standalone Nyaovim.app
    // The first argument of standalone distribution is the binary path
    let electron_argc = 1;

    const mainArgv = bridge.getArgv();

    // When application is executed via 'electron' ('Electron' on darwin) executable.
    if ('electron' === basename(mainArgv[0]).toLowerCase()) {
        // Note:
        // The first argument is a path to Electron executable.
        // The second argument is the path to main.js
        electron_argc = 2;
    }

    // Note:
    // First and second arguments are related to Electron
    // XXX:
    // Spectron additionally passes many specific arguments to process and 'nvim' process
    // will fail because of them. As a workaround, we stupidly ignore arguments on E2E tests.
    const a = process.env.NYAOVIM_E2E_TEST_RUNNING ? [] : mainArgv.slice(electron_argc);

    a.unshift(
        '--cmd', `let\\ g:nyaovim_version="${bridge.getVersion()}"`,
        '--cmd', `set\\ rtp+=${join(__dirname, '..', 'runtime').replace(' ', '\\ ')}`,
    );

    // XXX:
    // Swap files are disabled because it shows message window on start up but frontend can't detect it.
    a.unshift('-n');

    return a;
}

function prepareIpc(client: Nvim) {
    bridge.onExecCommands((cmds: string[]) => {
        for (const c of cmds) {
            client.command(c);
        }
    });

    bridge.onCopy(() => {
        // get current vim mode
        client.eval('mode()').then((value: any): void => {
            if (value.length === 0) {
                return undefined;
            }
            const ch = value[0];
            const code = value.charCodeAt(0);
            if (ch === 'v'       // visual mode
                || ch === 'V'    // visual line mode
                || code === 22   // visual block mode. 22 is returned by ':echo char2nr("\<C-v>")'
                ) {
                client.input('"+y');
            }
        });
    });

    bridge.onSelectAll(() => {
        // get current vim mode.
        client.eval('mode()').then((value: any): void => {
            if (value.length === 0) {
                return undefined;
            }

            const command = value[0] === 'n' ? 'ggVG' : '<Esc>ggVG';
            client.input(command);
        });
    });

    bridge.onCut(() => {
        // get current vim mode
        client.eval('mode()').then((value: any): void => {
            if (value.length === 0) {
                return undefined;
            }

            const ch = value[0];
            const num = value.charCodeAt(0);
            if (ch === 'v'  // visual mode
                || ch === 'V' // visual line mode
                || num === 22 // visual block mode
                ) {
                client.input('"+x');
            }
        });
    });

    bridge.onPaste(() => {
        // get current vim mode
        client.eval('mode()').then((value: any): void => {
            if (value.length === 0) {
                return undefined;
            }

            let command: string;

            const ch = value[0];
            const code = value.charCodeAt(0);
            if (ch === 'v') {
                // visual mode
                // deleting the highlighted area
                // to prevent vim from copying the area to the pasteboard
                command = '"_d"+P';
            } else if (ch === 'V') {
                // visual line mode
                command = '"_d"+p';
            } else if (code === 22 || ch === 'n') {
                // visual block mode
                // the "_d trick doesn't work here
                // because the visual selection will disappear after "_d command
                // or normal mode
                command = '"+p';
            } else if (ch === 'i') {
                // insert mode
                // gp will move cursor to the last of pasted content
                command = '"+gp';
            } else if (ch === 'c') {
                    // command line mode
                command = '<C-r>+';
            }

            if (command) {
                client.command(`normal! ${command}`);
            }
        });
    });
}

@customElement('nyaovim-app')
export class NyaoVimApp extends LitElement {
    static styles = css`
        :host {
            display: block;
            width: 100%;
            height: 100%;
        }
    `;

    @property({ type: Array })
    argv: string[] = buildArgv();

    editor: Neovim = null;

    private runtime_api: RuntimeApi;

    constructor() {
        super();
        this.runtime_api = new RuntimeApi({
            'nyaovim:load-path': (html_path: string) => {
                component_loader.loadComponent(html_path);
            },
            'nyaovim:load-plugin-dir': (dir_path: string) => {
                component_loader.loadPluginDir(dir_path);
            },
            'nyaovim:edit-start': (file_path: string) => {
                bridge.setRepresentedFilename(file_path);
                bridge.addRecentDocument(file_path);
            },
            'nyaovim:require-script-file': (script_path: string) => {
                require(script_path);
            },
            'nyaovim:call-global-function': (func_name: string, args: RPCValue[]) => {
                const func = (window as any)[func_name];
                if (func /*&& func is Function*/) {
                    func.apply(window, args);
                }
            },
            'nyaovim:open-devtools': (mode: 'right' | 'bottom' | 'undocked' | 'detach') => {
                bridge.openDevTools(mode);
            },
            'nyaovim:execute-javascript': (code: string) => {
                if (typeof code !== 'string') {
                    console.error('nyaovim:execute-javascript: Not a string', code);
                    return;
                }
                try {
                    // eslint-disable-next-line no-eval
                    eval(code);
                } catch (e) {
                    console.error('While executing javascript:', e, ' Code:', code);
                }
            },
            'nyaovim:browser-window': (method: string, args: RPCValue[]) => {
                try {
                    bridge.invokeBrowserWindowMethod(method, args);
                } catch (e) {
                    console.error("Error while executing 'nyaovim:browser-window':", e, ' Method:', method, ' Args:', args);
                }
            },
        });
    }

    render() {
        return html`
            <neovim-editor
                id="nyaovim-editor"
                .argv="${this.argv}"
                font="monospace"
            ></neovim-editor>
        `;
    }

    firstUpdated() {
        (global as any).hello = this;
        const element = this.renderRoot.querySelector('#nyaovim-editor') as NeovimElement;
        const editor = element.editor;
        editor.on('error', (err: Error) => alert(err.message));
        editor.on('quit', () => bridge.windowClose());
        this.editor = editor;

        editor.store.on('beep', () => bridge.beep());
        editor.store.on('title-changed', () => {
            document.title = editor.store.title;
        });

        editor.on('process-attached', () => {
            const client = editor.getClient();

            client.listRuntimePaths()
                  .then((rtp: string[]) => {
                      component_loader.loadFromRTP(rtp);
                      component_loader.initially_loaded = true;
                  });

            this.runtime_api.subscribe(client);

            element.addEventListener('drop', e => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) {
                    client.command('edit! ' + (f as any).path);
                }
            });

            bridge.onOpenFile((p: string) => {
                client.command('edit! ' + p);
            });

            prepareIpc(client);
        });

        element.addEventListener('dragover', e => e.preventDefault());

        window.addEventListener('keydown', e => {
            if (e.keyCode === 0x1b && !editor.store.focused) {
                // Note: Global shortcut to make focus back to screen
                editor.focus();
            }
        });
    }

    // TODO: Remove all listeners when detached
}
