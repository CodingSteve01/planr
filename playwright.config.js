// Real-browser tests: Chromium drives the BUILT app (`dist/`). No server is
// started anywhere; the fixture in e2e/fixtures.js serves dist/ by
// intercepting requests (docs/quality.md, "In a real browser").
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.output',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    locale: 'en-US',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
