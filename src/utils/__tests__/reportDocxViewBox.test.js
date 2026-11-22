/** @vitest-environment happy-dom */
import { describe, test, expect, vi } from 'vitest';

vi.mock('../export/fileHelpers.js', async orig => ({ ...(await orig()), download: () => {} }));

const rasterCalls = [];
vi.mock('../export/svgRaster.js', () => ({
  svgToDataUrl: async (svg, w, h) => {
    rasterCalls.push({ svg, w, h });
    return 'data:image/png;base64,iVBORw0KGgo=';
  },
}));

// The report text is stubbed so the roadmap SVG can carry any view box and
// attribute order; only the producer's marker (data-roadmap) is relied on.
const svgWith = attrs => `<svg ${attrs}><rect width="10" height="10"/></svg>`;
let report = '';
vi.mock('../report.js', () => ({ generateReport: () => report }));
const { exportReportDocx } = await import('../export/reportDocx.js');

async function run(html) {
  report = html;
  rasterCalls.length = 0;
  let out = '';
  window.HTMLToDOCX = async h => {
    out = h;
    return new Uint8Array([80, 75]);
  };
  await exportReportDocx({ meta: { name: 'Plan' }, lang: 'en', data: {} });
  return out;
}

describe('exportReportDocx() finds the roadmap by its marker', () => {
  test('a decimal view box with another attribute order is rasterised at its own size', async () => {
    const svg = svgWith('style="display:block" data-roadmap="1" viewBox="0 12.5 1400 640.5" xmlns="http://www.w3.org/2000/svg"');
    const html = await run(`<body><h2>Roadmap</h2>${svg}</body>`);
    expect(html).toContain('alt="Roadmap"');
    expect(html).not.toContain('<svg');
    expect(rasterCalls[0].w).toBe(1400);
    expect(rasterCalls[0].h).toBe(640.5);
    expect(rasterCalls[0].svg).toContain('viewBox="0 12.5 1400 640.5"');
  });

  test('another svg without the marker is left alone', async () => {
    const other = svgWith('viewBox="0 0 1400 600" xmlns="http://www.w3.org/2000/svg"');
    const html = await run(`<body>${other}</body>`);
    expect(rasterCalls).toHaveLength(0);
    expect(html).not.toContain('alt="Roadmap"');
  });
});
