import {_electron as electron, ElectronApplication, Page} from '@playwright/test';
import {join} from 'path';

export interface NyaovimTestApp {
    app: ElectronApplication;
    page: Page;
    close(): Promise<void>;
}

export async function launchNyaovim(extraArgs: string[] = []): Promise<NyaovimTestApp> {
    const app = await electron.launch({
        args: [join(__dirname, '..', '..', 'main', 'main.js'), ...extraArgs],
        env: {
            ...process.env,
            NYAOVIM_E2E_TEST_RUNNING: 'true',
            NODE_ENV: 'test',
        },
    });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    return {app, page, close: () => app.close()};
}
