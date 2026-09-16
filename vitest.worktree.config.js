import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
process.env.NODE_ENV = 'test';
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { obsidian: new URL('./obsidian/__tests__/obsidian-stub.js', import.meta.url).pathname } },
  server: { fs: { allow: ['/Users/steffenluling/RiderProjects/planr'] } },
});
