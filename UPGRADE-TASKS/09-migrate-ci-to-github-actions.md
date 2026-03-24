**Status:** done

# 09 — Migrate CI/CD from Travis CI to GitHub Actions

## Overview

NyaoVim uses **Travis CI** (`.travis.yml`) with Node.js 6, which is EOL and unsupported. Travis CI's free tier for open-source projects was severely limited in 2021. This task migrates the CI pipeline to **GitHub Actions**, which is free for open-source projects and natively integrated with the GitHub repository.

## Motivation

- Travis CI free tier is effectively unavailable for new open-source projects (limited credits).
- Node.js 6 in the Travis config is EOL since April 2019 — no security patches.
- GitHub Actions supports macOS, Linux, and Windows runners natively.
- GitHub Actions can cache `node_modules` for faster builds.
- GitHub Actions supports matrix builds for testing across multiple OS/Node versions.
- Neovim can be installed via the official `rhysd/action-setup-vim` action.

## Current Travis CI Configuration Summary

`.travis.yml` does:
1. Install Neovim (via PPA on Linux / brew on macOS)
2. Start a virtual X11 display (`Xvfb`) for headless Electron testing
3. `npm install && bower install`
4. Verify `nvim --version`
5. `npm run build`
6. `npm run lint`
7. `npm run smoke-test` (Mocha + Spectron)

## Steps

### Step 1 — Create `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [master, main]
  pull_request:
    branches: [master, main]

jobs:
  test:
    name: Test on ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node-version: ['22']

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install Neovim (Linux)
        if: runner.os == 'Linux'
        uses: rhysd/action-setup-vim@v1
        with:
          neovim: true
          version: stable

      - name: Install Neovim (macOS)
        if: runner.os == 'macOS'
        uses: rhysd/action-setup-vim@v1
        with:
          neovim: true
          version: stable

      - name: Install Neovim (Windows)
        if: runner.os == 'Windows'
        uses: rhysd/action-setup-vim@v1
        with:
          neovim: true
          version: stable

      - name: Verify Neovim installation
        run: nvim --version

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Lint
        run: npm run lint

      - name: Security audit
        run: npm audit --audit-level=moderate

      - name: Start virtual display (Linux)
        if: runner.os == 'Linux'
        run: |
          sudo apt-get install -y xvfb
          Xvfb :99 -screen 0 1280x1024x24 &
          echo "DISPLAY=:99" >> $GITHUB_ENV

      - name: Run smoke tests
        run: npm run smoke-test
        env:
          DISPLAY: ${{ env.DISPLAY }}

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: test-results-${{ matrix.os }}
          path: |
            test-results/
            playwright-report/
          retention-days: 7
```

### Step 2 — Add a release workflow

Create `.github/workflows/release.yml` for packaging the Electron app on tagged releases:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    name: Build ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Package (Linux)
        if: runner.os == 'Linux'
        run: npx @electron/packager . NyaoVim --platform=linux --arch=x64 --out=dist/

      - name: Package (macOS)
        if: runner.os == 'macOS'
        run: npx @electron/packager . NyaoVim --platform=darwin --arch=x64 --out=dist/

      - name: Package (Windows)
        if: runner.os == 'Windows'
        run: npx @electron/packager . NyaoVim --platform=win32 --arch=x64 --out=dist/

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: NyaoVim-${{ matrix.os }}-${{ github.ref_name }}
          path: dist/
```

### Step 3 — Update `package.json` scripts for CI

Ensure `npm ci` (not `npm install`) is used in CI for reproducible installs. This requires a `package-lock.json` (see task 07, Step 8).

Replace the `dep` script (which called `bower install`) with just:
```json
"prepare": "npm run build"
```

### Step 4 — Remove the Ruby Guard dependency from CI

The `Guardfile` and associated Ruby setup is not needed in CI (Guard is only for local development file watching). Remove any Ruby/Guard setup from CI scripts.

The `scripts/travis-before-install.sh` can be removed once the GitHub Actions workflow handles Neovim installation via `rhysd/action-setup-vim`.

### Step 5 — Replace the `watch` script with a cross-platform alternative

The current `watch` script uses Ruby Guard, which is a non-obvious dependency. Replace with a Node.js-based watcher:

```bash
npm install --save-dev chokidar-cli
```

Update `package.json`:
```json
"watch:main": "chokidar 'main/**/*.ts' -c 'npm run build:main'",
"watch:renderer": "chokidar 'renderer/**/*.ts' -c 'npm run build:renderer'",
"watch": "npm-run-all -p watch:main watch:renderer"
```

Delete `Guardfile` since it is only used for the watch script:
```bash
rm Guardfile
```

### Step 6 — Add `.github/CODEOWNERS` (optional)

If the project has active maintainers, create `.github/CODEOWNERS`:
```
* @rhysd
```

### Step 7 — Verify the workflow runs on GitHub

Push the workflow file to the repository and verify the Actions tab shows green checks on all three OS runners.

### Step 8 — Delete `.travis.yml`

Once GitHub Actions is confirmed working:
```bash
rm .travis.yml
rm scripts/travis-before-install.sh
```

Update `.npmignore` to remove the travis script:
```
scripts/travis-before-install.sh
```

## References

- [GitHub Actions docs](https://docs.github.com/en/actions)
- [rhysd/action-setup-vim](https://github.com/rhysd/action-setup-vim)
- [actions/setup-node](https://github.com/actions/setup-node)
- [Electron Forge CI docs](https://www.electronforge.io/guides/ci-cd)
- [Playwright CI docs](https://playwright.dev/docs/ci-github-actions)
