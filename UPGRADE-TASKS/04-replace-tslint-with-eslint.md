**Status:** pending

# 04 — Replace TSLint with ESLint

## Overview

NyaoVim uses **TSLint 5.9.1** for linting, configured with 163 rules in `tslint.json`. TSLint was **officially deprecated in 2019** and is no longer maintained. All TSLint rules have been ported to `typescript-eslint`. This task migrates linting to **ESLint** with `typescript-eslint`.

## Motivation

- TSLint receives no security updates or bug fixes.
- TypeScript itself recommends ESLint for TS projects.
- `typescript-eslint` provides equivalent or better coverage of every rule in the current `tslint.json`.
- ESLint has a much larger plugin ecosystem (import ordering, accessibility, etc.).
- The `tslint:disable` suppressions in the current source (e.g., around `eval()`) need to be migrated to ESLint equivalents.

## Steps

### Step 1 — Remove TSLint

```bash
npm uninstall tslint
```

### Step 2 — Install ESLint and typescript-eslint

```bash
npm install --save-dev eslint @eslint/js typescript-eslint
```

### Step 3 — Create `eslint.config.mjs`

Use the flat config format (ESLint 9+):

```javascript
// eslint.config.mjs
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // Migrate key rules from tslint.json:

            // Equivalent to tslint "no-console": false (allow console)
            'no-console': 'off',

            // Equivalent to tslint "no-eval": true
            'no-eval': 'error',

            // Equivalent to tslint "eqeqeq": true
            'eqeqeq': ['error', 'always'],

            // Equivalent to tslint "no-unused-variable"
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],

            // Equivalent to tslint "no-any": false (allow any for now)
            '@typescript-eslint/no-explicit-any': 'warn',

            // Equivalent to tslint "no-unsafe-any"
            '@typescript-eslint/no-unsafe-assignment': 'warn',
            '@typescript-eslint/no-unsafe-call': 'warn',
            '@typescript-eslint/no-unsafe-member-access': 'warn',

            // Equivalent to tslint "semicolon"
            '@typescript-eslint/semi': ['error', 'always'],

            // Equivalent to tslint "quotemark"
            '@typescript-eslint/quotes': ['error', 'single'],

            // Equivalent to tslint "trailing-comma"
            '@typescript-eslint/comma-dangle': 'off',

            // Prefer const (equivalent to tslint "prefer-const")
            'prefer-const': 'error',

            // No var (equivalent to tslint "no-var-keyword")
            'no-var': 'error',
        },
    },
    {
        // Apply to all TS source files
        files: ['main/**/*.ts', 'renderer/**/*.ts'],
    },
    {
        // Test files may use slightly looser rules
        files: ['test/**/*.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
    {
        // Ignore compiled output and third-party code
        ignores: [
            '**/*.js',
            'bower_components/**',
            'node_modules/**',
        ],
    },
);
```

### Step 4 — Migrate TSLint suppressions to ESLint equivalents

In `renderer/nyaovim-app.ts`, the `eval()` call is suppressed with:
```typescript
/* tslint:disable */
eval(code);
/* tslint:enable */
```

Replace with:
```typescript
// eslint-disable-next-line no-eval
eval(code);
```

(Or better — address the underlying issue as part of task 08.)

### Step 5 — Update npm scripts

In `package.json`, replace the TSLint scripts:

```json
{
  "scripts": {
    // REMOVE:
    "tslint:renderer": "tslint -p renderer/",
    "tslint:main": "tslint -p main/",

    // ADD:
    "lint:ts": "eslint main/**/*.ts renderer/**/*.ts test/**/*.ts",
    "lint": "npm-run-all -p lint:ts nsp"
  }
}
```

After completing task 07 (replacing `nsp`), update the `lint` script further:

```json
"lint": "npm-run-all -p lint:ts audit"
```

### Step 6 — Run ESLint and fix reported issues

```bash
npm run lint:ts
```

Work through the reported issues. Many will be auto-fixable:

```bash
npx eslint main/**/*.ts renderer/**/*.ts --fix
```

For remaining issues, fix them manually. Expected issues:
- `no-eval` on the intentional eval in `nyaovim-app.ts` (add suppression comment)
- `@typescript-eslint/no-explicit-any` on the various `(win as any)`, `(process as any)` casts
- Possible `@typescript-eslint/no-unsafe-*` warnings on dynamic invocations

### Step 7 — Delete `tslint.json`

```bash
rm tslint.json
```

### Step 8 — Update `.gitignore` (optional)

If you generate ESLint cache files:
```
.eslintcache
```

## Mapping Key TSLint Rules to ESLint

| TSLint Rule | ESLint Equivalent |
|------------|------------------|
| `no-eval` | `no-eval` |
| `no-var-keyword` | `no-var` |
| `prefer-const` | `prefer-const` |
| `eqeqeq` | `eqeqeq` |
| `no-any` | `@typescript-eslint/no-explicit-any` |
| `no-unsafe-any` | `@typescript-eslint/no-unsafe-*` |
| `semicolon` | `@typescript-eslint/semi` |
| `quotemark` | `@typescript-eslint/quotes` |
| `no-console` | `no-console` |
| `no-unused-variable` | `@typescript-eslint/no-unused-vars` |
| `trailing-comma` | `@typescript-eslint/comma-dangle` |
| `member-ordering` | `@typescript-eslint/member-ordering` |
| `no-shadowed-variable` | `no-shadow` |

## References

- [typescript-eslint](https://typescript-eslint.io/)
- [TSLint migration guide](https://typescript-eslint.io/getting-started/legacy-eslint-setup)
- [ESLint flat config docs](https://eslint.org/docs/latest/use/configure/configuration-files)
- [tslint-to-eslint-config tool](https://github.com/typescript-eslint/tslint-to-eslint-config)
