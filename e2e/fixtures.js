// The one fixture every browser test uses.
//
// No server: `dist/` (from `npm run build`, base `/planr/`) is handed to the
// browser by answering its requests from disk (`context.route`), so the page
// is loaded from http://planr.test/planr/ without anything listening.
//
// It also seeds localStorage before the page loads, collects every `pageerror`
// and `console.error`, fails the test if there was one, and saves a full-page
// screenshot as evidence.
import { test as base, expect } from '@playwright/test';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { PREFS, seedPlan } from './seed.js';

const DIST = path.resolve('dist');
const ORIGIN = 'http://planr.test';
export const APP_URL = `${ORIGIN}/planr/`;
export const SHOTS = path.resolve('e2e/.output/shots');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

// The file under dist/ a request path stands for, or null. Anything that
// would leave dist/ is refused.
export function fileFor(pathname) {
  const rel = decodeURIComponent(pathname).replace(/^\/planr\/?/, '') || 'index.html';
  const file = path.resolve(DIST, rel);
  if (!file.startsWith(DIST + path.sep)) return null;
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

// Hosts the built app is known to ask today. Keep this list short, and empty when it can be.
const KNOWN_EXTERNAL = /^fonts\.(googleapis|gstatic)\.com$/;

export const test = base.extend({
  // What the page starts with, over the defaults in seed.js: `{ plan, prefs }`.
  // Override per describe block with `test.use({ seed: { plan, prefs } })`.
  seed: [{}, { option: true }],

  // Playwright reads the first argument's keys to know what a fixture needs;
  // `browserName` is a built-in that costs nothing.
  problems: async ({ browserName: _browser }, provide) => {
    const list = [];
    await provide(list);
  },

  page: async ({ page, context, seed, problems }, provide, testInfo) => {
    if (!existsSync(path.join(DIST, 'index.html'))) throw new Error('dist/ is missing: run `npm run build` (or `npm run e2e`).');
    await context.route(`${ORIGIN}/planr/**`, route => {
      const file = fileFor(new URL(route.request().url()).pathname);
      if (!file) return route.fulfill({ status: 404, body: 'not in dist/' });
      return route.fulfill({ path: file, contentType: TYPES[path.extname(file)] || 'application/octet-stream' });
    });
    // Nothing else may leave the page. The one request the built app makes
    // today is a display font from Google Fonts (index.html); it is answered
    // with an empty stylesheet so the tests do not depend on the network.
    // Anything beyond that is a finding: the app is meant to work offline and
    // to send nothing anywhere.
    await context.route(
      url => !url.href.startsWith(ORIGIN),
      route => {
        const url = new URL(route.request().url());
        if (KNOWN_EXTERNAL.test(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
        problems.push(`network: the page asked for ${url.origin}${url.pathname}`);
        return route.abort();
      },
    );
    const store = { ...PREFS, ...seed.prefs, planr_v2: JSON.stringify(seed.plan || seedPlan()) };
    // Only the first load of a test is seeded: a reload must keep what the app wrote.
    await context.addInitScript(entries => {
      if (sessionStorage.getItem('e2e_seeded')) return;
      sessionStorage.setItem('e2e_seeded', '1');
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, store);
    page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
    page.on('console', m => {
      if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
    });
    await provide(page);
    // Evidence: what the page looked like when the test ended.
    mkdirSync(SHOTS, { recursive: true });
    const name = testInfo.titlePath
      .slice(1)
      .join(' ')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true }).catch(() => {});
    expect(problems, 'the page reported errors').toEqual([]);
  },
});

export { expect };

// A full-page screenshot under a stable name, for a human or an agent to look at.
export async function shoot(page, name) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}
