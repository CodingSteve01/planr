// What `npm run lint` holds the code to, and how it got there.
//
// It began as one rule, `no-undef`, after two deleted handlers shipped a white
// screen that 849 passing tests did not see. The rest was added in one step
// with a baseline: `eslint-suppressions.json` records, per file and rule, how
// many findings were there on the day the rule was switched on. Those are
// tolerated; one more in the same file is an error, and so is a suppression
// that is no longer needed (run `npm run lint:prune` after paying one off).
// So the numbers can only go down.
//
//   npm run lint          what CI runs
//   npm run lint:prune    drop suppressions that are no longer needed
//
// The limits (docs/quality.md has the reasons):
//   a function        complexity 15, nesting 4, 7 parameters,
//                     80 lines (.js) or 200 lines (.jsx: a component with its markup)
//   a file            800 lines
// Tests are held to correctness rules only: a `describe` block is one long
// function by nature.

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    // Other sessions' worktrees live under .claude and are not this checkout.
    ignores: ['dist/**', 'dist-obsidian/**', '.claude/**', 'node_modules/**'],
  },
  {
    files: ['src/**/*.{js,jsx}', 'obsidian/**/*.{js,jsx,mjs}', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.node,
        // The test files' own vocabulary.
        describe: 'readonly', it: 'readonly', test: 'readonly', expect: 'readonly',
        beforeEach: 'readonly', afterEach: 'readonly', beforeAll: 'readonly', afterAll: 'readonly',
        vi: 'readonly',
      },
    },
    // Registered so the `eslint-disable react-hooks/exhaustive-deps` comments
    // already in the code resolve to a real rule. Off, for now: the dependency
    // arrays in this codebase are deliberate in several places and arguing
    // with them is a separate piece of work from not shipping a white screen.
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      // The dependency arrays in this codebase are deliberate in several
      // places; arguing with them is a piece of work of its own.
      'react-hooks/exhaustive-deps': 'off',
      // A hook after an early return works until the day the return is taken.
      'react-hooks/rules-of-hooks': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-duplicate-imports': 'error',
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
    },
  },
  {
    // Size and shape, for the code that ships.
    files: ['src/**/*.{js,jsx}', 'obsidian/src/**/*.{js,jsx}', 'scripts/**/*.mjs'],
    ignores: ['**/__tests__/**', 'src/utils/pdfFonts.js', 'src/i18n.jsx'],
    rules: {
      complexity: ['error', 15],
      'max-depth': ['error', 4],
      'max-params': ['error', 7],
      'max-lines': ['error', { max: 800, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true, IIFEs: false }],
    },
  },
  {
    files: ['src/**/*.jsx', 'obsidian/src/**/*.jsx'],
    ignores: ['**/__tests__/**', 'src/i18n.jsx'],
    rules: { 'max-lines-per-function': ['error', { max: 200, skipBlankLines: true, skipComments: true, IIFEs: false }] },
  },
  {
    // The dictionary: one object literal, where the only thing that can go
    // wrong is the same key twice.
    files: ['src/i18n.jsx'],
    rules: { 'no-dupe-keys': 'error' },
  },
];
