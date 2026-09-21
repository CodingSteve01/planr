/** @vitest-environment happy-dom */
// The Subway map's tooltip trailed the cursor inside the Obsidian plugin and
// looked fine on the web. Reported as "ziemlich versetzt" — and the further
// right you pointed, the worse it got, which is the signature of a missing
// scale factor rather than a missing offset.
//
// Why: the map places its tooltip absolutely inside its own box, from
// `e.clientX - box.left`. Both of those are VIEWPORT pixels; `style.left` is
// written in the LOCAL pixels of that box. Planr sets `zoom` on its root for
// the interface-size setting, and defaults to 110% inside the plugin (see
// App.jsx) — so every local pixel is 1.1 viewport pixels, and a distance
// measured in viewport pixels comes out 10% too far right when written back.
//
// utils/embedHost.js already measures that factor for every other popup in
// the app (`fixedFrame().scale`); this test pins that the map divides it out
// too, and that nothing moves at 100%, where the two units coincide.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { Roadmap } from '../components/shared/Roadmap.jsx';
import { I18nProvider } from '../i18n.jsx';

const TREE = [
  { id: 'P1', name: 'Website Relaunch', type: 'goal', status: 'wip' },
  { id: 'P1.1', name: 'Design', status: 'done' },
  { id: 'P1.2', name: 'Build', status: 'open' },
];
const STATS = { P1: { _progress: 50 }, 'P1.1': { _progress: 100 }, 'P1.2': { _progress: 0 } };

const rect = (left, top, width, height) => ({
  left, top, width, height, right: left + width, bottom: top + height, x: left, y: top,
});

// The map's box starts 100 viewport pixels in, and the app root carries the
// given `zoom`. `fixedFrame` probes with a fixed, inset-0 div holding a ruler
// exactly 100px wide — both have to answer, or the measurement falls back to
// the viewport.
const MAP_W = 600, MAP_H = 400, MAP_LEFT = 100;
// `fixedFrame` caches its measurement per root for 500ms, and two tests in the
// same file run well inside that — the second would read the first one's
// scale. Move the clock forward instead of reaching into the cache.
let clockOffset = 0;
function mockLayout(scale) {
  clockOffset += 60_000;
  const realNow = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => realNow + clockOffset);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.style.width === '100px') return rect(0, 0, 100 * scale, 100 * scale);
    if (this.style.position === 'fixed') return rect(0, 0, 1200 * scale, 800 * scale);
    return rect(MAP_LEFT, 0, MAP_W * scale, MAP_H * scale);
  });
}

// The tooltip reads `data-tip` off whatever the pointer is over. What draws
// that attribute is the generated SVG, and this test is about arithmetic, not
// about markup — so hover a plain element placed inside the map's box. React
// listens at the root container, so a node appended by hand still reaches the
// wrapper's handler.
function hoverAt(wrapper, clientX, clientY) {
  const target = document.createElement('span');
  target.setAttribute('data-tip', 'Design');
  wrapper.appendChild(target);
  act(() => {
    target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX, clientY }));
  });
}

function renderMap() {
  const { container } = render(
    <I18nProvider><Roadmap tree={TREE} scheduled={[]} stats={STATS} /></I18nProvider>,
  );
  const wrapper = container.firstChild;
  expect(wrapper, 'the map did not render').toBeTruthy();
  return wrapper;
}

// The tooltip is the only absolutely-positioned child carrying a `left`.
const tipStyle = () => [...document.querySelectorAll('div[style*="position: absolute"]')]
  .map(el => el.style)
  .find(style => style.left && style.zIndex === '20');

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Subway map tooltip', () => {
  it('sits at the cursor on the web, where a local pixel is a viewport pixel', () => {
    mockLayout(1);
    hoverAt(renderMap(), 400, 100);

    // 400 − 100 into the box, plus the 14px nudge that keeps it off the pointer.
    expect(tipStyle().left).toBe('314px');
    expect(tipStyle().top).toBe('92px');
  });

  it('divides out the interface scale, so it does not trail the cursor in the plugin', () => {
    mockLayout(1.25);
    hoverAt(renderMap(), 400, 100);

    // The same 300 viewport pixels are 240 local ones at 125%. Writing 314
    // would have put the card 78 viewport pixels to the right of the pointer.
    expect(tipStyle().left).toBe('254px');
    expect(tipStyle().top).toBe('72px');
  });
});
