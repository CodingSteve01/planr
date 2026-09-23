/** @vitest-environment happy-dom */
// Reported, after losing a structure several times over: reaching for the
// start of a word inside a name — ⌥← on macOS, ⇧⌥← to select it — re-parented
// the item instead. The handler tested `altKey` and nothing else, so every
// word jump and every word selection inside a text box was an outdent or an
// indent. And ⌘Z is left to the browser while a field has focus, so the way
// back was to click away first and undo there, which nobody thinks of while
// watching their tree rearrange itself.
//
// Two rules, both here rather than behind a rendered grid: a gesture the text
// can use belongs to the text, and a key pressed inside a text entry never
// reaches the row shortcuts at all.
import { describe, it, expect, beforeEach } from 'vitest';
import { altArrowIsStructural, isTypingTarget } from '../components/views/TreeView.jsx';
import { markStructuralEdit, clearStructuralEdit, structuralEditPending } from '../utils/structuralEdit.js';

/** A text input with the caret somewhere in "Prices and conditions". */
function inputAt(start, end = start, value = 'Prices and conditions') {
  const el = document.createElement('input');
  el.value = value;
  el.setSelectionRange(start, end);
  return el;
}
const key = (k, el, mods = {}) => ({ key: k, target: el, shiftKey: false, ...mods });

describe('⌥+arrow inside a name', () => {
  it('is the text\'s when a selection gesture is asked for', () => {
    const el = inputAt(3);
    expect(altArrowIsStructural(key('ArrowLeft', el, { shiftKey: true }))).toBe(false);
    expect(altArrowIsStructural(key('ArrowRight', el, { shiftKey: true }))).toBe(false);
  });

  it('is the text\'s when the caret still has a word to jump', () => {
    expect(altArrowIsStructural(key('ArrowLeft', inputAt(7)))).toBe(false);
    expect(altArrowIsStructural(key('ArrowRight', inputAt(7)))).toBe(false);
  });

  it('is the text\'s when a range is selected', () => {
    expect(altArrowIsStructural(key('ArrowLeft', inputAt(0, 6)))).toBe(false);
  });

  it('is the tree\'s at the very start and the very end', () => {
    // Not taken away — it falls through exactly where the text cannot use it,
    // which is where the caret sits when a name has just been typed.
    expect(altArrowIsStructural(key('ArrowLeft', inputAt(0)))).toBe(true);
    expect(altArrowIsStructural(key('ArrowRight', inputAt('Prices and conditions'.length)))).toBe(true);
  });

  it('is the tree\'s when there is no caret to speak of', () => {
    const div = document.createElement('div');
    expect(altArrowIsStructural(key('ArrowRight', div))).toBe(false);
  });
});

describe('what counts as typing', () => {
  it.each(['text', 'search', 'email', 'number', 'password', 'date', undefined])('an <input type=%s> does', type => {
    const el = document.createElement('input');
    if (type) el.type = type;
    expect(isTypingTarget(el)).toBe(true);
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

describe('undo after a structure command from inside a field', () => {
  beforeEach(() => clearStructuralEdit());

  it('is the app\'s until the next keystroke edits the text', () => {
    expect(structuralEditPending()).toBe(false);
    markStructuralEdit();
    expect(structuralEditPending()).toBe(true);
    clearStructuralEdit();          // what the input's onChange does
    expect(structuralEditPending()).toBe(false);
  });
});
