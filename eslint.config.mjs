// ESLint flat config for the monorepo (PLAN 0.1). Formatting is Prettier's job (eslint-config-prettier last).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-demo/**',
      '**/.next/**',
      '**/coverage/**',
      'apps/web/next-env.d.ts',
      'packages/contracts/lib/**',
      'infra/cdk/cdk.out/**',
      'infra/cdk/jest.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // unused args are fine when prefixed with _ (interface implementations, handler signatures)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    // NestJS injects by class reference: type-only imports would erase the constructor parameter's metadata
    files: ['apps/api/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
  {
    // seeds, scripts and tests may log progress
    files: ['apps/api/src/database/**', 'apps/api/test/**', '**/*.spec.ts', '**/scripts/**'],
    rules: { 'no-console': 'off' },
  },
  {
    // demo hosting helpers run as plain CommonJS Node scripts (infra/demo/start.sh)
    files: ['infra/demo/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off', 'no-console': 'off' },
  },
  prettier,
);
