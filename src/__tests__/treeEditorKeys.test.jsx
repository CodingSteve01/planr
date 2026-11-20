/** @vitest-environment happy-dom */
// Reported, after losing a structure several times over: reaching for the
// start of a word inside a name — ⌥← on macOS, ⇧⌥← to select it — re-parented
// the item instead. The handler tested `altKey` and nothing else, so every
// word jump and every word selection inside a text box was an outdent or an
// indent. And ⌘Z is left to the browser while a field has focus, so the way
// back was to click away first and undo there, which nobody thinks of while
// watching their tree rearrange itself.
//
// The rule now is the strict one: while a field has the keyboard there are
// no structural gestures at all — not ⌥+arrow, not ⌘⇧+arrow — so a word jump
// or a selection can never move the item. What counts as "a field" is
// isTypingTarget, checked here without a rendered grid.
import { describe, it, expect } from 'vitest';
import { isTypingTarget } from '../components/views/TreeView.jsx';

describe('what counts as typing', () => {
  it.each(['text', 'search', 'email', 'number', 'password', 'date', undefined])('an <input type=%s> does', type => {
    const el = document.createElement('input');
    if (type) el.type = type;
    expect(isTypingTarget(el)).toBe(true);
  });

  it('a combobox does, whatever element carries the role', () => {
    const div = document.createElement('div');
    div.setAttribute('role', 'combobox');
    expect(isTypingTarget(div)).toBe(true);
  });

  it('a textarea, a select and a contenteditable do', () => {
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
    const div = document.createElement('div');
    Object.defineProperty(div, 'isContentEditable', { value: true });
    expect(isTypingTarget(div)).toBe(true);
  });

  it('a checkbox does not — arrows there are navigation, not editing', () => {
    const el = document.createElement('input');
    el.type = 'checkbox';
    expect(isTypingTarget(el)).toBe(false);
  });

  it('a row, a button and nothing at all do not', () => {
    expect(isTypingTarget(document.createElement('tr'))).toBe(false);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
