// One rule, and the reason it exists is a white screen.
//
// Two handlers were deleted by a careless region replacement in App.jsx while
// three other identifiers around them were being merged. Everything still
// built, 849 tests still passed, and the plugin went blank the moment anybody
// opened the Planning tab — because nothing in the app reads an identifier
// until React renders the component that uses it, and no test opened that tab.
//
// `no-undef` catches that before it is written to disk. It is deliberately the
// only rule turned on: a style config over ten thousand lines of existing code
// is a week of arguing about semicolons, and the bug that actually shipped was
// not a style problem. More rules can be earned later, one at a time, each
// with a reason.
//
//   npm run lint

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
      'no-undef': 'error',
      'react-hooks/exhaustive-deps': 'off',
      // Off, and it should not stay off: it reports 12 real violations that
      // predate this config (QuickEdit.jsx and three others call hooks after
      // an early return). Turning it on today would mean `npm run lint` fails
      // from the first run, which teaches everyone to ignore it. Fix them,
      // then flip it — that is a piece of work with its own PR.
      'react-hooks/rules-of-hooks': 'off',
    },
  },
];
