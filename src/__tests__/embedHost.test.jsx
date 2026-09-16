/** @vitest-environment happy-dom */
// The host surface has exactly one subtle piece: a popup positioned with
// `position: fixed` is placed in its containing block, and that is the
// viewport only as long as no ancestor has a transform. Obsidian animates its
// workspace leaves, so inside the plugin every tooltip, dropdown and context
// menu is placed relative to the leaf while the mouse still reports viewport
// coordinates — which is how a tooltip lands two panes away from the cursor.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixedFrame, hostTheme, onHostThemeChange, portalHost, toFixedPoint } from '../utils/embedHost.js';

afterEach(() => {
  delete window.__planrHost;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/**
 * A host whose fixed-position containing block sits at `left`/`top`, under a
 * `zoom` of `scale`. The probe measures two things — the box and a ruler of
 * known width — so the stand-in has to answer both.
 */
function hostWithFrame(frame, scale = 1) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.style.width === '100px') {
      return { left: 0, top: 0, width: 100 * scale, height: 100 * scale, right: 100 * scale, bottom: 100 * scale };
    }
    return { ...frame, right: frame.left + frame.width, bottom: frame.top + frame.height };
  });
  window.__planrHost = { portalRoot: root };
  return root;
}

describe('without a host', () => {
  it('portals to the body', () => {
    expect(portalHost()).toBe(document.body);
  });

  it('reports the viewport as the frame, so nothing shifts on the web', () => {
    expect(fixedFrame()).toMatchObject({
      left: 0, top: 0, scale: 1, width: window.innerWidth, height: window.innerHeight,
    });
    expect(toFixedPoint(120, 40)).toEqual({ x: 120, y: 40 });
  });

  it('leaves "Auto" to the OS', () => {
    expect(hostTheme()).toBeNull();
    expect(typeof onHostThemeChange(() => {})).toBe('function');
  });
});

describe('with a host', () => {
  it('measures where a fixed element actually lands', () => {
    hostWithFrame({ left: 320, top: 44, width: 900, height: 600 });
    expect(fixedFrame()).toMatchObject({ left: 320, top: 44, width: 900, height: 600, scale: 1 });
    // A tooltip at the cursor, not a pane to the right of it.
    expect(toFixedPoint(400, 100)).toEqual({ x: 80, y: 56 });
  });

  it('divides out the UI scale, because a popup writes the lengths zoom multiplies', () => {
    // At 125%, `style.left = '80px'` puts the popup 100 viewport pixels in —
    // so the 100 the mouse reported has to be written as 80.
    hostWithFrame({ left: 320, top: 44, width: 900, height: 600 }, 1.25);
    const frame = fixedFrame();
    expect(frame.scale).toBe(1.25);
    expect(frame.width).toBe(720);
    expect(toFixedPoint(420, 44, frame)).toEqual({ x: 80, y: 0 });
  });

  it('portals into the host root, where the scoped stylesheet reaches', () => {
    const root = hostWithFrame({ left: 0, top: 0, width: 100, height: 100 });
    expect(portalHost()).toBe(root);
  });

  it('takes "Auto" from the host, not the OS', () => {
    window.__planrHost = { theme: () => 'dark' };
    expect(hostTheme()).toBe('dark');
  });

  it('ignores a host that answers with nonsense', () => {
    window.__planrHost = { theme: () => 'sepia' };
    expect(hostTheme()).toBeNull();
  });

  it('hands back the host unsubscribe function', () => {
    const off = () => {};
    window.__planrHost = { onThemeChange: () => off };
    expect(onHostThemeChange(() => {})).toBe(off);
  });
});
