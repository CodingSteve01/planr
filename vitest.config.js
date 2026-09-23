import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Reuse the React plugin so JSX in tests gets the same automatic runtime
// transform as the app build. Tests opt into a DOM environment per file
// via the `/** @vitest-environment happy-dom */` pragma; pure-logic tests
// stay on the default node environment.
//
// Force NODE_ENV=test BEFORE Vite reads it so React resolves to its dev
// build. With the user's shell having NODE_ENV=production exported, the
// production React build would otherwise load and refuse act() from
// @testing-library/react ("act(...) is not supported in production
// builds of React").
process.env.NODE_ENV = 'test';

export default defineConfig({
  plugins: [react()],
  test: {
    // Test THIS checkout, not the ones parked beside it.
    //
    // `.claude/worktrees/` holds live git worktrees at other commits, each
    // with its own `src/__tests__`. The default glob walked into them, so a
    // full run executed a couple of hundred tests from branches that have
    // nothing to do with the one in hand — and their failures arrived
    // indistinguishable from a regression here, right down to the file name.
    // A worktree has `vitest.worktree.config.js` for running its own suite.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/worktrees/**'],
    // A whole-App render is not a 5-second unit test.
    //
    // Most files here mount the real App, schedule a plan and wait for the
    // result, and on a busy machine that is comfortably slower than the 5s
    // default. The symptom was a suite that failed two or three times per
    // run with a different set of tests each time — every one of them green
    // on its own, every one of them ending in "Test timed out in 5000ms" or
    // a `findBy` that ran out of patience. Hours go into reading that as a
    // regression in whatever was just edited.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: {
      // The plugin's vault layer imports `obsidian`, a module that only
      // exists inside the app. Tests get a shape-compatible stand-in.
      obsidian: fileURLToPath(new URL('./obsidian/__tests__/obsidian-stub.js', import.meta.url)),
    },
  },
});
