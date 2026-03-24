import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            parserOptions: {
                project: ['./main/tsconfig.json', './renderer/tsconfig.json', './test/tsconfig.json'],
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // Equivalent to tslint "no-console": false (allow console)
            'no-console': 'off',

            // Allow require() imports — codebase uses CommonJS module style
            '@typescript-eslint/no-require-imports': 'off',

            // Equivalent to tslint "no-eval": true
            'no-eval': 'error',

            // Equivalent to tslint "eqeqeq": true
            'eqeqeq': ['error', 'always'],

            // Equivalent to tslint "no-unused-variable"
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],

            // Equivalent to tslint "no-any": false (allow any for now — warn only)
            '@typescript-eslint/no-explicit-any': 'warn',

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
            'build/**',
        ],
    },
);
