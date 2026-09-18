/** @vitest-environment happy-dom */
// "Die Subway-Map ist gar nicht mehr zu sehen."
//
// The roadmap's renderer returns two documents in one string: the map, then an
// HTML legend as its sibling. Parsing that whole string as image/svg+xml — one
// root element only — is a parse error ("Extra content at the end of the
// document"), so nothing at all reached the page: no map, no legend, and no
// message either, because a failed XML parse is a document, not a throw.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SvgMarkup } from '../components/shared/SvgMarkup.jsx';
import { renderRoadmapSvg, splitSvgMarkup } from '../utils/roadmap.js';
import { treeStats } from '../utils/scheduler.js';

const d = iso => new Date(iso + 'T00:00:00');
const TREE = [
  { id: 'P1', name: 'Vordispo', status: 'wip', best: 0 },
  { id: 'P1.1', name: 'Analyse', status: 'done', progress: 100, best: 1, factor: 1 },
  { id: 'P1.2', name: 'Umsetzung', status: 'wip', progress: 40, best: 1, factor: 1 },
];
const SCHEDULED = [
  { id: 'P1.1', name: 'Analyse', status: 'done', effort: 1, startD: d('2026-01-01'), endD: d('2026-01-05') },
  { id: 'P1.2', name: 'Umsetzung', status: 'wip', effort: 1, startD: d('2026-02-01'), endD: d('2026-02-10') },
];

afterEach(() => cleanup());

describe('the drawing and what follows it', () => {
  it('ends the drawing at the tag that closes it, not the first one it sees', () => {
    const [svg, rest] = splitSvgMarkup(
      '<svg><g><svg><circle/></svg></g></svg><div>legend</div>',
    );
    expect(svg).toBe('<svg><g><svg><circle/></svg></g></svg>');
    expect(rest).toBe('<div>legend</div>');
  });

  it('reports no remainder for a drawing that stands alone', () => {
    expect(splitSvgMarkup('<svg><rect/></svg>')).toEqual(['<svg><rect/></svg>', '']);
  });
});

describe('the subway map', () => {
  it('puts both the map and its legend on the page', () => {
    const markup = renderRoadmapSvg({ tree: TREE, scheduled: SCHEDULED, stats: treeStats(TREE), now: d('2026-01-15') });
    // The renderer really does hand over two documents — if that ever changes,
    // this test should be the thing that says so.
    const [, legend] = splitSvgMarkup(markup);
    expect(legend.trim()).not.toBe('');

    const { container } = render(<SvgMarkup markup={markup} />);
    const host = container.firstChild;

    expect(host.querySelector('svg')).not.toBeNull();
    // The legend is HTML, and has to arrive as HTML — an SVG-namespaced <div>
    // parses fine and renders as nothing.
    const legendRoot = [...host.children].find(el => el.tagName.toLowerCase() === 'div');
    expect(legendRoot).toBeDefined();
    expect(legendRoot.textContent).toContain('Vordispo');
  });
});
