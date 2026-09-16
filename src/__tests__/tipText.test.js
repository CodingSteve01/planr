// Tooltips used to be HTML strings handed to innerHTML, escaped by hand on the
// way in. They are text now, in a dialect of three symbols — which only works
// if the parser is exactly as literal as it looks.
import { describe, expect, it } from 'vitest';
import { parseTip, tipLines } from '../utils/tipText.js';

const tones = line => line.parts.map(p => `${p.tone}:${p.text}`);

describe('parseTip', () => {
  it('reads a plain line as one plain part', () => {
    expect(parseTip('134 scheduled')).toEqual([{ indent: false, parts: [{ text: '134 scheduled', tone: 'normal' }] }]);
  });

  it('marks emphasis and asides', () => {
    expect(tones(parseTip('**Anna**: 120% · __add people__')[0]))
      .toEqual(['bold:Anna', 'normal:: 120% · ', 'muted:add people']);
  });

  it('breaks lines on newlines', () => {
    expect(parseTip('one\ntwo').map(l => l.parts[0].text)).toEqual(['one', 'two']);
  });

  it('indents a line that starts a detail', () => {
    expect(parseTip('- P1.1 Prices · 5d')[0].indent).toBe(true);
  });

  it('leaves a lone marker as text', () => {
    // A task called "2 * 3" must not become half a bold run.
    expect(tones(parseTip('2 * 3 and a _ here')[0])).toEqual(['normal:2 * 3 and a _ here']);
  });

  it('does not let a marker span lines', () => {
    expect(tones(parseTip('**open\nclosed**')[0])).toEqual(['normal:**open']);
  });

  it('survives nothing at all', () => {
    expect(parseTip(null)).toEqual([{ indent: false, parts: [] }]);
  });
});

describe('tipLines', () => {
  it('drops the lines a caller decided not to write', () => {
    expect(tipLines('a', null, false, undefined, 'b')).toBe('a\nb');
  });

  it('keeps an empty string, which is a blank line on purpose', () => {
    expect(tipLines('a', '', 'b')).toBe('a\n\nb');
  });
});
