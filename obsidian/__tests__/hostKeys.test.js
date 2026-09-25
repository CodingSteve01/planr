// Reported: ⌘F did nothing in the plugin. Obsidian's own hotkey took the key
// in the capture phase and stopped it before Planr heard it. The view now
// claims Planr's chords on its own Scope — this checks that it claims every
// chord of the keyboard map, in the form Obsidian matches, and in a way that
// lets the key through to the app.
import { describe, it, expect } from 'vitest';
import { Scope } from 'obsidian';
import { parseChord, planrChords, claimPlanrKeys } from '../src/hostKeys.js';
import { PlanrView } from '../src/main.jsx';

describe('Planr keys inside Obsidian', () => {
  it('reads the keyboard map glyphs as Obsidian modifiers and key names', () => {
    expect(parseChord('⌘F')).toEqual({ modifiers: ['Mod'], key: 'F' });
    expect(parseChord('⇧⌘S')).toEqual({ modifiers: ['Mod', 'Shift'], key: 'S' });
    expect(parseChord('Ctrl⇧↑')).toEqual({ modifiers: ['Mod', 'Shift'], key: 'ArrowUp' });
    expect(parseChord('⌘↵')).toEqual({ modifiers: ['Mod'], key: 'Enter' });
    expect(parseChord('⌥⇧Space')).toEqual({ modifiers: ['Alt', 'Shift'], key: ' ' });
    expect(parseChord('⌘,')).toEqual({ modifiers: ['Mod'], key: ',' });
    // Bare keys are no Obsidian hotkey and stay unclaimed.
    expect(parseChord('E')).toBeNull();
    expect(parseChord('⇧↵')).toBeNull();
  });

  it('claims find, undo and every other chord of the keyboard map, once each', () => {
    const chords = planrChords().map(c => `${c.modifiers.join('+')}+${c.key}`);
    for (const c of ['Mod+F', 'Mod+Z', 'Mod+Shift+Z', 'Mod+S', 'Mod+Shift+S', 'Mod+K', 'Mod+ArrowDown', 'Mod+Shift+ArrowUp', 'Alt+1']) {
      expect(chords).toContain(c);
    }
    expect(new Set(chords).size).toBe(chords.length);
  });

  it('answers true — ends the hotkey lookup without swallowing the event', () => {
    // Obsidian only calls preventDefault/stopPropagation on an answer of false.
    const scope = claimPlanrKeys(new Scope(null));
    expect(scope.keys.length).toBe(planrChords().length);
    expect(scope.keys.every(k => k.func() === true)).toBe(true);
  });

  it('gives every plan view that scope', () => {
    const view = new PlanrView({ app: {} }, {});
    const keys = view.scope.keys.map(k => `${k.modifiers.join('+')}+${k.key}`);
    expect(keys).toContain('Mod+F');
  });
});
