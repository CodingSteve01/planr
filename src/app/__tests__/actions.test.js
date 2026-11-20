// The action modules are bound by name and spread into one object the
// components read from. Two exports with the same name would mean one
// silently replaces the other, depending on the order they are spread in.
import { describe, it, expect } from 'vitest';
import { bindActions, mergeNamed } from '../actions/bindActions.js';
import * as nodeEdits from '../actions/nodeEdits.js';
import * as splitEdits from '../actions/splitEdits.js';
import * as planEdits from '../actions/planEdits.js';
import * as treeEditorEdits from '../actions/treeEditorEdits.js';
import * as queueEdits from '../actions/queueEdits.js';
import * as resourceEdits from '../actions/resourceEdits.js';
import * as openEdits from '../actions/openEdits.js';

const modules = { nodeEdits, splitEdits, planEdits, treeEditorEdits, queueEdits, resourceEdits, openEdits };

describe('the action modules', () => {
  it('export every name once across all of them', () => {
    const seen = new Map();
    const twice = [];
    for (const [file, mod] of Object.entries(modules)) {
      for (const name of Object.keys(mod)) {
        if (seen.has(name)) twice.push(`${name}: ${seen.get(name)} and ${file}`);
        seen.set(name, file);
      }
    }
    expect(twice).toEqual([]);
    expect(seen.size).toBeGreaterThan(40);
  });

  it('export functions only: every export becomes an action', () => {
    for (const [file, mod] of Object.entries(modules)) {
      for (const [name, value] of Object.entries(mod)) expect(typeof value, `${file}.${name}`).toBe('function');
    }
  });

  it('binds each function to the context of the render that built it', () => {
    const bound = bindActions({ n: 2 }, { add: (ctx, x) => ctx.n + x, twice: ctx => ctx.n * 2 });
    expect(bound.add(3)).toBe(5);
    expect(bound.twice()).toBe(4);
  });

  it('refuses to merge two actions of the same name', () => {
    expect(mergeNamed({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
    expect(() => mergeNamed({ save: 1 }, { load: 2 }, { save: 3 })).toThrow('two actions are called "save"');
  });
});
