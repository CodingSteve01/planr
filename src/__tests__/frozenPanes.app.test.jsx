/** @vitest-environment happy-dom */
// "Warum fühlt sich diese Liste so performant an und der Tree eher nicht?"
//
// Because the tree is rarely the only thing mounted. Every tab you visit stays
// in the DOM behind the active one — deliberately, so switching back is
// instant — and every one of them takes `tree` as a prop, so an edit re-renders
// the Gantt, the roadmap and the network graph too, all of them hidden.
//
// Measured at 1000 tasks, a keystroke in the tree cost 525 ms with only the
// tree open and 1287 ms after visiting four more tabs. The work order feels
// quick partly because it is simpler and mostly because you have just arrived
// and nothing else is warm yet.
//
// A hidden pane cannot show anything, so it has no business re-rendering. This
// asserts the mechanism rather than a millisecond count: a wall-clock budget in
// a test is a flake waiting for a slow CI box.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { useRef, useState } from 'react';
import { Frozen } from '../components/shared/Frozen.jsx';

function Counter({ label, onRender }) {
  onRender(label);
  return <div>{label}</div>;
}

describe('a hidden pane', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('does not re-render while it is hidden', async () => {
    const renders = [];
    let bump;
    function Host() {
      const [n, setN] = useState(0);
      bump = () => setN(v => v + 1);
      return <>
        <Frozen active><Counter label={`visible-${n}`} onRender={l => renders.push(l)} /></Frozen>
        <Frozen active={false}><Counter label={`hidden-${n}`} onRender={l => renders.push(l)} /></Frozen>
      </>;
    }
    render(<Host />);
    expect(renders).toEqual(['visible-0', 'hidden-0']);

    await act(async () => { bump(); });
    // The visible one followed the change; the hidden one did not run at all.
    expect(renders).toEqual(['visible-0', 'hidden-0', 'visible-1']);
  });

  it('catches up the moment it is shown again', async () => {
    const renders = [];
    let show;
    function Host() {
      const [n, setN] = useState(0);
      const [on, setOn] = useState(false);
      show = () => { setN(v => v + 1); setOn(true); };
      return <Frozen active={on}><Counter label={`pane-${n}`} onRender={l => renders.push(l)} /></Frozen>;
    }
    render(<Host />);
    await act(async () => { show(); });
    // Not the stale pane-0 it was holding: what it shows is current.
    expect(renders[renders.length - 1]).toBe('pane-1');
  });

  it('keeps the pane mounted, so its own state survives being hidden', async () => {
    // The whole reason the panes stay in the DOM: scroll position, zoom, which
    // sub-tab you were on. Freezing must not cost that.
    const seen = [];
    let toggle;
    function Keeps() {
      const born = useRef(Math.random());
      seen.push(born.current);
      return <div>x</div>;
    }
    function Host() {
      const [on, setOn] = useState(true);
      toggle = () => setOn(v => !v);
      return <Frozen active={on}><Keeps /></Frozen>;
    }
    render(<Host />);
    const first = seen[0];
    await act(async () => { toggle(); });
    await act(async () => { toggle(); });
    expect(seen[seen.length - 1]).toBe(first);
  });
});
