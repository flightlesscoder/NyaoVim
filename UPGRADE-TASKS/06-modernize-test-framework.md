**Status:** pending

# 06 — Modernize Test Framework (Spectron → Playwright)

## Overview

The current test stack uses:
- **Mocha 5.1.1** (2018) — test runner
- **Chai 4.1.2** — assertion library
- **Spectron 3.8.0** — Electron E2E testing framework (wraps WebdriverIO 4)

**Spectron** was deprecated in 2022 and its repository archived. It was designed for Electron 1–13 and does not support modern Electron. This task migrates E2E tests to **Playwright** with the `@playwright/test` runner, which has official Electron support.

## Motivation

- Spectron is incompatible with Electron 14+ (required for task 01).
- Spectron's underlying WebdriverIO version is 4.x (current is 9.x) — a 5-major-version gap.
- `@types/webdriverio@4` is stale.
- Playwright has native Electron support via `playwright._electron`, officially endorsed by Electron maintainers.
- Playwright's test runner has built-in parallel execution, retries, and HTML reports.
- `@playwright/test` replaces Mocha + Chai in one package.

## Steps

### Step 1 — Remove old test dependencies

```bash
npm uninstall spectron mocha chai @types/mocha @types/chai @types/webdriverio @types/bluebird @types/q
```

These types were mostly for Spectron/WebdriverIO internals.

### Step 2 — Install Playwright

```bash
npm install --save-dev @playwright/test playwright
```

Download the Playwright browser binaries:
```bash
npx playwright install
```

Note: For Electron testing, Playwright uses the Electron binary from the project — it does not download a separate Chromium. So the `playwright install` step is optional for pure Electron tests.

### Step 3 — Create `playwright.config.ts`

```typescript
import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
    testDir: './test',
    testMatch: '**/*.spec.ts',
    timeout: 30_000,
    use: {
        // Electron-specific config set per test via _electron.launch()
    },
    reporter: [['list'], ['html', { open: 'never' }]],
});
```

### Step 4 — Create test helper `test/helper/nyaovim.ts` (rewrite)

Replace the Spectron-based helper with a Playwright Electron helper:

```typescript
import { _electron as electron, ElectronApplication, Page } from 'playwright';
import path from 'path';

export interface NyaovimTestApp {
    app: ElectronApplication;
    page: Page;
    close(): Promise<void>;
}

export async function launchNyaovim(extraArgs: string[] = []): Promise<NyaovimTestApp> {
    const app = await electron.launch({
        args: [path.join(__dirname, '../../main/main.js'), ...extraArgs],
        env: {
            ...process.env,
            NYAOVIM_E2E_TEST_RUNNING: 'true',
            NODE_ENV: 'test',
        },
    });

    // Wait for the first window
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    return {
        app,
        page,
        close: () => app.close(),
    };
}
```

### Step 5 — Rewrite `test/smoke/startup.ts` → `test/smoke/startup.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { launchNyaovim } from '../helper/nyaovim';

test.describe('NyaoVim startup', () => {
    test('opens exactly one window', async () => {
        const { app, close } = await launchNyaovim();
        try {
            const windows = app.windows();
            expect(windows).toHaveLength(1);
        } finally {
            await close();
        }
    });

    test('has no console errors on startup', async () => {
        const { page, close } = await launchNyaovim();
        const errors: string[] = [];
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });
        try {
            // Wait for the app to settle
            await page.waitForTimeout(3000);
            expect(errors).toEqual([]);
        } finally {
            await close();
        }
    });

    test('renders nyaovim-app component', async () => {
        const { page, close } = await launchNyaovim();
        try {
            await page.waitForTimeout(3000);
            const component = page.locator('nyaovim-app');
            await expect(component).toBeAttached();
        } finally {
            await close();
        }
    });

    test('neovim process starts without error', async () => {
        const { page, close } = await launchNyaovim();
        try {
            await page.waitForTimeout(3000);
            // Check the editor element exists (from neovim-component)
            const editor = page.locator('neovim-editor');
            await expect(editor).toBeAttached();
        } finally {
            await close();
        }
    });
});
```

### Step 6 — Update `test/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "strict": true,
    "esModuleInterop": true,
    "types": ["node"]
  },
  "include": ["**/*.ts"]
}
```

Remove `@types/mocha`, `@types/chai`, `@types/webdriverio` from the types list.

### Step 7 — Update npm scripts in `package.json`

```json
{
  "scripts": {
    "build:test": "tsc --pretty -p test/",
    "smoke-test": "npm run build:test && npx playwright test test/smoke",
    "test": "npm run smoke-test"
  }
}
```

### Step 8 — Remove `test/lib.d.ts`

The `test/lib.d.ts` file contains a polyfill declaration for `Object.assign`. This is not needed with modern TypeScript/Node.

```bash
rm test/lib.d.ts
```

### Step 9 — Update CI

In GitHub Actions (task 10), add a step to install Playwright:

```yaml
- name: Install Playwright
  run: npx playwright install --with-deps
```

### Step 10 — (Optional) Add unit tests

With Playwright's test runner in place, consider adding unit tests for pure TypeScript modules (e.g., `browser-config.ts` config parsing logic) using Playwright's Node-mode testing or switching to **Vitest** for unit tests alongside Playwright for E2E tests.

```bash
npm install --save-dev vitest
```

## Migration Notes

- Playwright's Electron support requires Electron 12+. Complete task 01 first.
- The 3-second hardcoded wait in the current tests should be replaced with `waitForSelector` or `waitForFunction` for reliability.
- The `NYAOVIM_E2E_TEST_RUNNING` environment variable mechanism should be preserved.

## References

- [Playwright Electron testing](https://playwright.dev/docs/api/class-electron)
- [Spectron deprecation notice](https://github.com/electron-userland/spectron#-spectron-is-deprecated)
- [Playwright test runner docs](https://playwright.dev/docs/intro)
- [Migrating from Mocha to Playwright](https://playwright.dev/docs/test-migrate-from-mocha)
