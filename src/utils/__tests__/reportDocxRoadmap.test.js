/** @vitest-environment happy-dom */
import { describe, test, expect, vi } from 'vitest';
import { treeStats } from '../scheduler.js';

vi.mock('../export/fileHelpers.js', async orig => ({ ...(await orig()), download: () => {} }));
// happy-dom has no canvas; a rasterised picture is stood in by a tiny PNG.
vi.mock('../export/svgRaster.js', () => ({ svgToDataUrl: async () => 'data:image/png;base64,iVBORw0KGgo=' }));
const { exportReportDocx } = await import('../export/reportDocx.js');

const d = isoStr => new Date(`${isoStr}T00:00:00`);

// The roadmap SVG is drawn with a view box that follows the number of lanes,
// so it is not 1400 × 800 in general. Whatever its size, it must not reach the
// DOCX converter as an inline <svg>: the converter cannot read it and the
// document ends at the Roadmap heading.
describe('exportReportDocx() with a roadmap of any height', () => {
  test('no inline roadmap SVG is handed to the converter', async () => {
    const tree = [
      { id: 'P1', name: 'Rechnungen', status: 'wip' },
      { id: 'P1.1', name: 'Übersicht', status: 'open', best: 2, factor: 1, team: 'T1', assign: ['m1'] },
      { id: 'P2', name: 'Kundenbereich', status: 'open' },
      { id: 'P2.1', name: 'Anmeldung', status: 'open', best: 4, factor: 1, team: 'T1', assign: ['m1'] },
    ];
    const scheduled = tree
      .filter(r => r.id.includes('.'))
      .map((r, i) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        team: 'T1',
        person: 'Anna Noor',
        personId: 'm1',
        effort: r.best,
        startD: d(`2026-01-0${5 + i}`),
        endD: d(`2026-01-0${6 + i}`),
      }));
    let html = '';
    window.HTMLToDOCX = async h => {
      html = h;
      return new Uint8Array([80, 75]);
    };
    await exportReportDocx({
      tree,
      scheduled,
      members: [{ id: 'm1', name: 'Anna Noor', team: 'T1', cap: 1 }],
      teams: [{ id: 'T1', name: 'Frontend', color: '#2563eb' }],
      weeks: [],
      cpSet: new Set(),
      goalPaths: {},
      stats: treeStats(tree),
      confidence: {},
      meta: { name: 'Plan', planStart: '2026-01-05' },
      lang: 'de',
      data: {},
    });
    expect(html).toContain('alt="Roadmap"');
    expect(html).not.toContain('data-roadmap');
  });
});
