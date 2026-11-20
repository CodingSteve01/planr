// Open the command palette, and keep asking until it is open.
//
// The palette listens on `window`, and that listener is attached by an effect.
// A single `/` fired before the effect has run is simply lost — and `findBy`
// then waits out its timeout on a palette that nothing is ever going to open.
// It fails as "Unable to find [data-testid=palette-input]", which reads like
// the palette is broken rather than like a keystroke arriving too early. On a
// fast machine the effect always wins the race; in CI it does not, and that is
// what stopped a release.
//
// The palette also ignores `/` while focus is in a field, where it is just a
// character to type, so anything focused by an earlier interaction has to be
// let go of first.
import { act, fireEvent, screen, waitFor } from '@testing-library/react';

export async function openPalette() {
  document.activeElement?.blur?.();
  await waitFor(async () => {
    if (screen.queryByTestId('palette-input')) return;
    await act(async () => { fireEvent.keyDown(window, { key: '/', bubbles: true }); });
    if (!screen.queryByTestId('palette-input')) throw new Error('palette did not open');
  });
  return screen.getByTestId('palette-input');
}

/** Open it, type `query`, take the first hit. */
export async function runCommand(query) {
  const input = await openPalette();
  await act(async () => { fireEvent.change(input, { target: { value: query } }); });
  await act(async () => { fireEvent.keyDown(input, { key: 'Enter', bubbles: true }); });
}
