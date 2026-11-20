/** @vitest-environment happy-dom */
// `/` opens the palette (when focus isn't already in a field) and Enter runs
// the highlighted command. The filter/selection logic itself is covered as
// pure logic in src/utils/__tests__/palette.test.js — this test only proves
// the keyboard wiring and rendering.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { CommandPalette } from '../components/shared/CommandPalette.jsx';
import { I18nProvider } from '../i18n.jsx';

describe('CommandPalette', () => {
  beforeEach(() => {
    cleanup();
  });

  it('is not rendered until opened', () => {
    render(
      <I18nProvider>
        <CommandPalette commands={[{ id: 'a', labelKey: 'save', run: () => {} }]} />
      </I18nProvider>,
    );
    expect(screen.queryByTestId('command-palette')).toBeNull();
  });

  it('opens on "/" (focus not in a field) and Enter runs the highlighted command', () => {
    const run = vi.fn();
    render(
      <I18nProvider>
        <CommandPalette
          commands={[
            { id: 'first', labelKey: 'save', run },
            { id: 'second', labelKey: 'cancel', run: vi.fn() },
          ]}
        />
      </I18nProvider>,
    );

    expect(screen.queryByTestId('command-palette')).toBeNull();
    fireEvent.keyDown(window, { key: '/' });
    expect(screen.getByTestId('command-palette')).toBeTruthy();

    fireEvent.keyDown(screen.getByPlaceholderText(/./), { key: 'Enter' });
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('command-palette')).toBeNull();
  });

  it('does not open on "/" while typing in a text field', () => {
    render(
      <>
        <input data-testid="some-field" />
        <I18nProvider>
          <CommandPalette commands={[{ id: 'a', labelKey: 'save', run: () => {} }]} />
        </I18nProvider>
      </>,
    );
    const field = screen.getByTestId('some-field');
    field.focus();
    fireEvent.keyDown(window, { key: '/' });
    expect(screen.queryByTestId('command-palette')).toBeNull();
  });

  it('Escape closes the palette', () => {
    render(
      <I18nProvider>
        <CommandPalette commands={[{ id: 'a', labelKey: 'save', run: () => {} }]} />
      </I18nProvider>,
    );
    fireEvent.keyDown(window, { key: '/' });
    expect(screen.getByTestId('command-palette')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('command-palette')).toBeNull();
  });
});
