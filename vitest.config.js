import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Reuse the React plugin so JSX in tests gets the same automatic runtime
// transform as the app build. Tests opt into a DOM environment per file
// via the `/** @vitest-environment happy-dom */` pragma; pure-logic tests
// stay on the default node environment.
export default defineConfig({
  plugins: [react()],
});
