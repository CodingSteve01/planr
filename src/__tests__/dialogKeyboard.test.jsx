/** @vitest-environment happy-dom */
// Reported: the item dialog opens with E, and then nothing in it can be done
// by keyboard. Nothing inside had focus, the tabs took no keys, the Insights
// sections were click-only, Save had no key, Tab walked out into the page
// behind — and Esc in an open dropdown closed the whole dialog.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { NodeModal } from '../components/modals/NodeModal.jsx';

const tree = [
  { id: 'P1', name: 'Project', status: 'wip', deps: [], assign: [] },
  { id: 'P1.1', name: 'Selected task', status: 'open', best: 2, factor: 1, team: 'T1', deps: [], assign: ['m1'] },
];
const common = {
  tree, members: [{ id: 'm1', name: 'Jonas', team: 'T1', cap: 1 }], teams: [{ id: 'T1', name: 'Backend' }],
  taskTemplates: [], sizes: [], customFields: [], scheduled: [],
  cpSet: new Set(), stats: {}, confidence: {}, confReasons: {},
};
const open = props => render(<I18nProvider><ThemeProvider>
  <NodeModal node={tree[1]} {...common} onUpdate={() => {}} onClose={() => {}} {...props} />
</ThemeProvider></I18nProvider>);
const selectedTab = () => document.querySelector('[role="tab"][aria-selected="true"]');
const key = init => act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })); });
const frame = () => act(async () => { await new Promise(r => requestAnimationFrame(() => r())); });

beforeEach(() => { cleanup(); localStorage.clear(); localStorage.setItem('planr_lang', 'en'); });
afterEach(() => vi.unstubAllGlobals());

describe('the item dialog by keyboard', () => {
  it('puts focus on the active tab when it opens', async () => {
    open();
    await frame();
    expect(document.activeElement).toBe(selectedTab());
  });

  it('switches tabs with the arrows on the tab bar and with ⌥1–⌥7 anywhere', async () => {
    open();
    await frame();
    await act(async () => { fireEvent.keyDown(selectedTab(), { key: 'ArrowRight' }); });
    expect(selectedTab().getAttribute('data-testid')).toBe('nm-tab-overview');
    await act(async () => { fireEvent.keyDown(selectedTab(), { key: 'End' }); });
    expect(selectedTab().getAttribute('data-testid')).toBe('nm-tab-advanced');
    await key({ key: '¡', code: 'Digit1', altKey: true });
    expect(selectedTab().getAttribute('data-testid')).toBe('nm-tab-insights');
    await key({ key: '™', code: 'Digit4', altKey: true });
    expect(selectedTab().getAttribute('data-testid')).toBe('nm-tab-effort');
  });

  it('opens an Insights section with Enter', async () => {
    open();
    const people = screen.getByRole('button', { name: /^People/ });
    expect(people.tabIndex).toBe(0);
    await act(async () => { fireEvent.keyDown(people, { key: 'Enter' }); });
    // Where it lands is insightJumps.test.jsx's business; here: it went.
    expect(selectedTab().getAttribute('data-testid')).not.toBe('nm-tab-insights');
  });

  it('saves and closes with ⌘↵', async () => {
    const onUpdate = vi.fn(), onClose = vi.fn();
    open({ onUpdate, onClose });
    fireEvent.mouseDown(screen.getByTestId('nm-tab-overview'), { button: 0 });
    fireEvent.change(screen.getByDisplayValue('Selected task'), { target: { value: 'Renamed' } });
    await key({ key: 'Enter', metaKey: true });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Renamed' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps Tab inside the dialog', async () => {
    open();
    await frame();
    const modal = screen.getByTestId('node-modal');
    const focusables = [...modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled);
    focusables[focusables.length - 1].focus();
    await key({ key: 'Tab' });
    expect(document.activeElement).toBe(focusables[0]);
    await key({ key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
  });

  it('leaves Esc to an open dropdown instead of closing', async () => {
    const onClose = vi.fn();
    open({ onClose });
    fireEvent.mouseDown(screen.getByTestId('nm-tab-overview'), { button: 0 });
    const input = screen.getByPlaceholderText('Assign person...');
    await act(async () => { fireEvent.focus(input); fireEvent.click(input); });
    await act(async () => { fireEvent.keyDown(input, { key: 'Escape' }); });
    expect(onClose).not.toHaveBeenCalled();
    await key({ key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
