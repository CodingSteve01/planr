/** @vitest-environment happy-dom */
// Reported: tabbing through the dropdowns opens all of them at once, and
// inside a text box the ordinary editing keys are overridden by the special
// ones.
//
// Both come from the same place: the dropdown behaves like a popup that only
// a mouse can dismiss, and like a listbox that happens to contain an input
// rather than an input that happens to open a list. Tabbing out has to close
// it, and the keys that belong to a text caret have to stay with the caret.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { SearchSelect } from '../components/shared/SearchSelect.jsx';
import { placeHoverTip } from '../components/shared/HoverTip.jsx';
import { I18nProvider } from '../i18n.jsx';
import { PortalRootContext } from '../utils/embedHost.js';

const OPTIONS = [
  { id: 'T1', label: 'Frontend' },
  { id: 'T2', label: 'Backend' },
  { id: 'T3', label: 'Infra' },
];

function renderTwo() {
  return render(
    <I18nProvider>
      <SearchSelect value="" options={OPTIONS} onSelect={() => {}} placeholder="Team" testId="one" allowEmpty emptyLabel="No team" />
      <SearchSelect value="" options={OPTIONS} onSelect={() => {}} placeholder="Phase" testId="two" allowEmpty emptyLabel="No phase" />
    </I18nProvider>,
  );
}

const popups = () => document.querySelectorAll('[data-searchselect-popup]');

describe('tabbing from one dropdown to the next', () => {
  beforeEach(() => { cleanup(); localStorage.clear(); localStorage.setItem('planr_lang', 'en'); });
  afterEach(() => cleanup());

  it('leaves exactly one open', () => {
    renderTwo();
    const one = screen.getByTestId('one');
    const two = screen.getByTestId('two');

    fireEvent.focus(one);
    expect(popups()).toHaveLength(1);

    // Tab: the browser focuses the next field, which blurs this one with the
    // next as relatedTarget. Four inline fields in a row used to end up with
    // four popups stacked over each other.
    fireEvent.blur(one, { relatedTarget: two });
    fireEvent.focus(two);
    expect(popups()).toHaveLength(1);
  });

  it('stays open when focus moves inside its own popup', () => {
    renderTwo();
    const one = screen.getByTestId('one');
    fireEvent.focus(one);
    const popup = popups()[0];
    fireEvent.blur(one, { relatedTarget: popup });
    expect(popups()).toHaveLength(1);
  });

  it('stays open when the blur has nowhere to point', () => {
    // A mousedown on a popup row blurs the input with no relatedTarget. Closing
    // here would unmount the row before its click lands — the choice would be
    // eaten. That case belongs to the document mousedown listener.
    renderTwo();
    const one = screen.getByTestId('one');
    fireEvent.focus(one);
    fireEvent.blur(one, { relatedTarget: null });
    expect(popups()).toHaveLength(1);
  });
});

describe('the keys that belong to the caret', () => {
  beforeEach(() => { cleanup(); localStorage.clear(); localStorage.setItem('planr_lang', 'en'); });
  afterEach(() => cleanup());

  it('leaves Home and End to the text field', () => {
    renderTwo();
    const one = screen.getByTestId('one');
    fireEvent.focus(one);
    fireEvent.change(one, { target: { value: 'front' } });

    for (const key of ['Home', 'End']) {
      expect(fireEvent.keyDown(one, { key }), `${key} was swallowed`).toBe(true);
    }
  });

  it('still keeps the keys a list needs', () => {
    renderTwo();
    const one = screen.getByTestId('one');
    fireEvent.focus(one);
    // fireEvent returns false once preventDefault ran: these are handled.
    expect(fireEvent.keyDown(one, { key: 'ArrowDown' })).toBe(false);
    expect(fireEvent.keyDown(one, { key: 'Enter' })).toBe(false);
  });
});

// ── and the tooltip that shivered along the right edge ────────────────────
// Reported: tooltips near the right edge of the screen jitter as the cursor
// moves over the items.
//
// The flip needs the tooltip's size, and a size is only knowable after a
// render — so every mouse move painted it overflowing the edge first and
// pulled it back a frame later. The fix is to keep the last measurement: the
// size does not change while you hover the same thing, so the next position
// is right on the first paint. What is left to pin here is the arithmetic
// that first paint now uses.
describe('placing a tooltip', () => {
  const frame = { left: 0, top: 0, width: 1000, height: 800, scale: 1 };

  it('sits below and right of the cursor when there is room', () => {
    expect(placeHoverTip(100, 100, 200, 60, frame)).toEqual({ left: 114, top: 114 });
  });

  it('flips to the other side of the cursor at the right edge', () => {
    expect(placeHoverTip(950, 100, 200, 60, frame).left).toBe(736);
  });

  it('flips above the cursor at the bottom edge', () => {
    expect(placeHoverTip(100, 780, 200, 60, frame).top).toBe(706);
  });

  it('does not flip on a size it has not measured yet', () => {
    // First paint of a tooltip nobody has seen before: better one frame in
    // the wrong place than a jump every time the mouse moves.
    expect(placeHoverTip(950, 100, 0, 0, frame)).toEqual({ left: 964, top: 114 });
  });

  it('never leaves the frame on the near side', () => {
    expect(placeHoverTip(2, 2, 400, 400, frame)).toEqual({ left: 16, top: 16 });
  });
});

// Reported: the dropdown fields no longer work — they are plain text boxes
// now and cannot be operated.
//
// Two Planr views in Obsidian, and the popup of the one you are looking at
// rendering into the other one's DOM, where it is invisible — an input with
// nothing behind it. The portal root used to be a single pointer on `window`
// that every newly mounted view overwrote; it now travels down the tree, so
// each instance portals into the container it was rendered in.
describe('two app instances side by side', () => {
  beforeEach(() => { cleanup(); localStorage.clear(); localStorage.setItem('planr_lang', 'en'); });
  afterEach(() => cleanup());

  it('each portals its popup into its own root', () => {
    const left = document.createElement('div');
    const right = document.createElement('div');
    document.body.append(left, right);

    render(
      <I18nProvider>
        <PortalRootContext.Provider value={left}>
          <SearchSelect value="" options={OPTIONS} onSelect={() => {}} testId="left" />
        </PortalRootContext.Provider>
        <PortalRootContext.Provider value={right}>
          <SearchSelect value="" options={OPTIONS} onSelect={() => {}} testId="right" />
        </PortalRootContext.Provider>
      </I18nProvider>,
    );

    fireEvent.focus(screen.getByTestId('left'));
    expect(left.querySelectorAll('[data-searchselect-popup]')).toHaveLength(1);
    expect(right.querySelectorAll('[data-searchselect-popup]')).toHaveLength(0);

    fireEvent.focus(screen.getByTestId('right'));
    expect(right.querySelectorAll('[data-searchselect-popup]')).toHaveLength(1);

    left.remove();
    right.remove();
  });

  it('falls back to the body when nobody is hosting it', () => {
    render(
      <I18nProvider>
        <SearchSelect value="" options={OPTIONS} onSelect={() => {}} testId="plain" />
      </I18nProvider>,
    );
    fireEvent.focus(screen.getByTestId('plain'));
    expect(document.body.querySelectorAll('[data-searchselect-popup]')).toHaveLength(1);
  });
});
