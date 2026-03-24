**Status:** pending

# 07 — Replace `nsp` with `npm audit`

## Overview

The project uses **nsp** (Node Security Platform) v3.2.1 for dependency vulnerability scanning. NSP was shut down and deprecated in **2017** when it was acquired by npm, Inc. and merged into `npm audit`. The `nsp` package still exists but does nothing useful — it no longer connects to any active vulnerability database.

## Motivation

- `nsp` silently does nothing. Running `npm run nsp` gives a false sense of security.
- `npm audit` is built into npm 6+ and queries the npm advisory database (which absorbed NSP's data).
- No additional packages are needed.

## Steps

### Step 1 — Remove `nsp`

```bash
npm uninstall nsp
```

### Step 2 — Update npm scripts

In `package.json`, replace:

```json
"nsp": "nsp check",
"lint": "npm-run-all -p tslint:renderer tslint:main nsp"
```

With:

```json
"audit": "npm audit --audit-level=moderate",
"lint": "npm-run-all -p lint:ts audit"
```

(The `lint:ts` script name comes from task 04. If task 04 is not yet complete, use `tslint:renderer tslint:main` in place of `lint:ts`.)

### Step 3 — Run `npm audit` and review current vulnerabilities

```bash
npm audit
```

Review the output and prioritize:

- **Critical/High**: Fix immediately (update the package or find an alternative)
- **Moderate**: Fix as part of this task or the relevant upgrade task
- **Low**: Track and fix opportunistically

Given the age of dependencies (Electron 1.8, Mocha 5, Spectron 3), expect a large number of advisories. The majority will be resolved by completing tasks 01, 06, and 10 which update the core dependencies.

### Step 4 — Attempt auto-fix

```bash
npm audit fix
```

This will auto-update packages to the nearest non-breaking version that resolves the advisory. Review the diff carefully:

```bash
git diff package.json
```

### Step 5 — Fix breaking-change advisories manually

For advisories that `npm audit fix` cannot resolve automatically (because the fix requires a semver-major update), address them manually as part of the relevant upgrade tasks:

| Package | Advisory Fix Version | Task |
|---------|---------------------|------|
| `electron` | 14+ | Task 01 |
| `spectron` | Remove | Task 06 |
| `bower` | Remove | Task 03 |
| `deep-extend` | ^0.6.0 | This task (see below) |
| `mkdirp` | ^3.0.0 | Step 6 |

### Step 6 — Update `deep-extend` and `mkdirp`

These are small production dependencies with known advisories in older versions:

```bash
npm install deep-extend@latest mkdirp@latest
```

Note: `mkdirp` v1+ changed its API to remove the callback form. Check usage in the codebase:

```bash
grep -r "mkdirp" main/ renderer/ --include="*.ts"
```

Update any callback-style usage to the promise-based form:

```typescript
// OLD (mkdirp 0.x callback style)
mkdirp(dirPath, (err) => { ... });

// NEW (mkdirp 1+ promise style)
await mkdirp(dirPath);
```

### Step 7 — Add audit to CI

In GitHub Actions (task 10), add an audit step:

```yaml
- name: Security audit
  run: npm audit --audit-level=moderate
```

### Step 8 — Set up `package-lock.json`

The current `.npmrc` contains `package-lock=false`. This disables lock files, making builds non-reproducible and `npm audit` less effective. Remove this setting:

```bash
# Delete or edit .npmrc
rm .npmrc
```

Then generate a lock file:

```bash
npm install
git add package-lock.json
git commit -m "Add package-lock.json for reproducible builds"
```

Note: Enabling the lock file may change installed versions slightly. Run `npm run build && npm run smoke-test` after to confirm nothing breaks.

## References

- [npm audit documentation](https://docs.npmjs.com/cli/v10/commands/npm-audit)
- [NSP shutdown announcement](https://blog.npmjs.org/post/172623826765/the-node-security-platform-has-been-acquired)
- [mkdirp v1 changelog](https://github.com/isaacs/mkdirp/blob/main/CHANGELOG.md)
