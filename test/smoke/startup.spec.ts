import {test, expect} from '@playwright/test';
import {launchNyaovim, NyaovimTestApp} from '../helper/nyaovim';

test.describe('Startup', () => {
    let nyaovim: NyaovimTestApp;

    test.beforeEach(async () => {
        nyaovim = await launchNyaovim();
        // Wait for nvim process to start
        await nyaovim.page.waitForTimeout(3000);
    });

    test.afterEach(async ({}, testInfo) => {
        if (testInfo.status !== 'passed') {
            const logs = await nyaovim.app.evaluate(async ({app}) => {
                return app.getAppPath();
            });
            console.log('App path:', logs);
        }
        await nyaovim.close();
    });

    test('opens a window', async () => {
        const windows = nyaovim.app.windows();
        expect(windows).toHaveLength(1);
        const isVisible = await nyaovim.page.isVisible('body');
        expect(isVisible).toBe(true);
    });

    test('renders <nyaovim-app> in HTML', async () => {
        const element = await nyaovim.page.$('nyaovim-app');
        expect(element).not.toBeNull();
    });

    test('spawns nvim process without error', async () => {
        const started = await nyaovim.page.evaluate(() => {
            const app = document.querySelector('nyaovim-app') as any;
            return app && app.editor && app.editor.process && app.editor.process.started;
        });
        expect(started).toBe(true);
    });
});
