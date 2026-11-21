import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
process.env.NODE_ENV = 'test';
export default defineConfig({
  plugins: [react()],
  // The browser tests under e2e/ are Playwright's, not vitest's.
  test: { exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'] },
  resolve: { alias: { obsidian: new URL('./obsidian/__tests__/obsidian-stub.js', import.meta.url).pathname } },
  server: { fs: { allow: [new URL('../../..', import.meta.url).pathname] } },
});
