import {defineConfig} from '@playwright/test';

export default defineConfig({
    testDir: './test',
    testMatch: '**/*.spec.ts',
    timeout: 30_000,
    reporter: [['list'], ['html', {open: 'never'}]],
});
