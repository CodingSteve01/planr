/** @vitest-environment happy-dom */
// One task, one row.
//
// Seen in a pane around 800px wide: the name column was narrower than the
// team column, so "Document security policies" wrapped onto three lines and a
// 34px row became 90px tall. Eight tasks filled the screen instead of
// twenty-five, and the tree read as a wall rather than a list — which is
// exactly the complaint it drew.
//
// The name is the column that identifies the row, so it takes the space and
// everything else stays at its own width. When the pane is genuinely too
// narrow for all of them, columns drop in a fixed order instead of starving
// the name: schedule first, then team, then the signal glyphs. Never the
// name, never who, never the effort.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const css = readFileSync(path.join(process.cwd(), 'src/App.css'), 'utf8');
const ruleFor = sel => {
  const at = css.indexOf(sel + '{');
  return at < 0 ? null : css.slice(at, css.indexOf('}', at));
};

describe('a tree row', () => {
  it('keeps the name on one line and cuts it with an ellipsis', () => {
    const rule = ruleFor('.tree-tbl td[data-col="name"] .tn');
    expect(rule, 'no rule for the name text').toBeTruthy();
    expect(rule).toMatch(/white-space:\s*nowrap/);
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
    expect(rule).toMatch(/overflow:\s*hidden/);
  });

  it('lets the name cell collapse so the ellipsis can happen at all', () => {
    // The trick this depends on: in an auto-layout table a cell only lets its
    // content ellipsise when the cell itself may shrink. Without max-width:0
    // the nowrap above pushes the table wider than the pane instead.
    expect(ruleFor('.tree-tbl td[data-col="name"]')).toMatch(/max-width:\s*0/);
  });

  it('gives the name column the leftover width', () => {
    expect(ruleFor('.tree-tbl td[data-col="name"]')).toMatch(/width:\s*100%/);
  });
});

describe('a narrow pane', () => {
  // Container queries, not media queries: inside the Obsidian plugin the
  // window's width says nothing about how wide this view actually is.
  it('measures the view, not the window', () => {
    expect(css).toMatch(/container-type:\s*inline-size/);
    expect(css).toMatch(/@container\b/);
  });

  it('drops columns in order — schedule, then team, then signal', () => {
    const queries = [...css.matchAll(/@container[^{]*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/g)]
      .map(m => ({ at: Number(m[1]), body: m[2] }))
      .sort((a, b) => b.at - a.at);
    expect(queries.length, 'no container queries for the tree').toBeGreaterThanOrEqual(3);

    const dropsAt = col => {
      const hit = queries.find(q => new RegExp(`data-col="${col}"[^{]*\\{[^}]*display:\\s*none`).test(q.body));
      return hit ? hit.at : null;
    };
    const schedule = dropsAt('schedule');
    const team = dropsAt('team');
    const signal = dropsAt('signal');
    expect(schedule, 'schedule never drops').toBeTruthy();
    expect(team, 'team never drops').toBeTruthy();
    expect(signal, 'signal never drops').toBeTruthy();
    // Widest threshold goes first.
    expect(schedule).toBeGreaterThan(team);
    expect(team).toBeGreaterThan(signal);
  });

  it('never drops the name, who or effort', () => {
    for (const col of ['name', 'who', 'effort']) {
      expect(css, `${col} is dropped somewhere`)
        .not.toMatch(new RegExp(`data-col="${col}"[^{]*\\{[^}]*display:\\s*none`));
    }
  });
});
