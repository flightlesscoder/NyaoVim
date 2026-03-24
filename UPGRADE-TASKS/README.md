# NyaoVim Upgrade Tasks

This directory contains a prioritized set of modernization tasks for NyaoVim. Tasks are numbered in the recommended execution order — earlier tasks unblock later ones.

## Task Summary

| # | File | Area | Priority | Blocks |
|---|------|------|----------|--------|
| 01 | [01-upgrade-electron.md](01-upgrade-electron.md) | Core | **Critical** | Everything |
| 02 | [02-migrate-from-remote-to-contextbridge.md](02-migrate-from-remote-to-contextbridge.md) | Security/API | **Critical** | Task 01 (Electron 14+) |
| 03 | [03-remove-bower-and-migrate-polymer.md](03-remove-bower-and-migrate-polymer.md) | Dependencies | High | — |
| 04 | [04-replace-tslint-with-eslint.md](04-replace-tslint-with-eslint.md) | Tooling | High | — |
| 05 | [05-enable-typescript-strict-mode.md](05-enable-typescript-strict-mode.md) | Type Safety | High | Tasks 02, 12 |
| 06 | [06-modernize-test-framework.md](06-modernize-test-framework.md) | Testing | High | Task 01 |
| 07 | [07-replace-nsp-with-npm-audit.md](07-replace-nsp-with-npm-audit.md) | Security | Medium | — |
| 08 | [08-fix-security-vulnerabilities.md](08-fix-security-vulnerabilities.md) | Security | Medium | Task 02 |
| 09 | [09-migrate-ci-to-github-actions.md](09-migrate-ci-to-github-actions.md) | CI/CD | Medium | Tasks 06, 07 |
| 10 | [10-update-remaining-dependencies.md](10-update-remaining-dependencies.md) | Dependencies | Medium | Task 01 |
| 11 | [11-modernize-build-system.md](11-modernize-build-system.md) | Build | Low | — |
| 12 | [12-update-types-and-node-compatibility.md](12-update-types-and-node-compatibility.md) | Types | Medium | Task 01 |

## Key Findings from Codebase Audit

**What the project is**: An Electron-based Neovim frontend that lets users extend the editor UI with Web Components, HTML, and JavaScript.

**Current stack** (as of audit):
- Electron 1.8.8 (2018 — critically outdated)
- TypeScript 6.0.2 (recently upgraded, but with strict checks disabled)
- Polymer 2 + Bower (both deprecated)
- TSLint 5.9.1 (deprecated in 2019)
- Spectron 3.8.0 + Mocha 5 (Spectron archived in 2022)
- Node.js type definitions from 2018 (`@types/node@9`)
- Travis CI with Node.js 6 (EOL 2019)
- nsp (deprecated, does nothing)

**Most critical issues**:
1. Electron 1.8 bundles Chromium 59 with thousands of known CVEs.
2. `electron.remote` is used in 10+ places — this API was removed in Electron 14.
3. `app.makeSingleInstance()` was removed in Electron 9.
4. Bower and Polymer 2 are both abandoned.
5. Spectron is incompatible with modern Electron and is archived.

## Recommended Starting Order

```
Task 07 (nsp → npm audit)   ← quick win, no dependencies
Task 04 (TSLint → ESLint)   ← quick win, improves all future work
Task 12 (types/node)        ← unblocks Task 05
Task 02 (remote → contextBridge) ← must precede Electron 14+
Task 01 (Electron upgrade)  ← the big one; do in phases
Task 03 (Bower/Polymer)     ← parallel with Electron work
Task 06 (Playwright)        ← after Electron is upgraded
Task 05 (strict TypeScript) ← after types and remote migration
Task 08 (security fixes)    ← after contextBridge migration
Task 10 (remaining deps)    ← after Electron upgrade
Task 09 (GitHub Actions)    ← after test framework is working
Task 11 (build system)      ← last, lowest priority
```
