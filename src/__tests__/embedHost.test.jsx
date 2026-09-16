/** @vitest-environment happy-dom */
// The host surface has exactly one subtle piece: a popup positioned with
// `position: fixed` is placed in its containing block, and that is the
// viewport only as long as no ancestor has a transform. Obsidian animates its
// workspace leaves, so inside the plugin every tooltip, dropdown and context
// menu is placed relative to the leaf while the mouse still reports viewport
// coordinates — which is how a tooltip lands two panes away from the cursor.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixedFrame, hostTheme, onHostThemeChange, portalHost } from '../utils/embedHost.js';

afterEach(() => {
  delete window.__planrHost;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A host whose fixed-position containing block sits at `left`/`top`. */
function hostWithFrame(frame) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    ...frame, right: frame.left + frame.width, bottom: frame.top + frame.height,
  });
  window.__planrHost = { portalRoot: root };
  return root;
}

describe('without a host', () => {
  it('portals to the body', () => {
    expect(portalHost()).toBe(document.body);
  });

  it('reports the viewport as the frame, so nothing shifts on the web', () => {
    expect(fixedFrame()).toEqual({
      left: 0, top: 0, width: window.innerWidth, height: window.innerHeight,
    });
  });

  it('leaves "Auto" to the OS', () => {
    expect(hostTheme()).toBeNull();
    expect(typeof onHostThemeChange(() => {})).toBe('function');
  });
});

describe('with a host', () => {
  it('measures where a fixed element actually lands', () => {
    vi.useFakeTimers();
    hostWithFrame({ left: 320, top: 44, width: 900, height: 600 });
    expect(fixedFrame()).toEqual({ left: 320, top: 44, width: 900, height: 600 });
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
