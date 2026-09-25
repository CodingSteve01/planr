/** @vitest-environment happy-dom */
// Links and jumps in the two item editors that landed in the wrong place:
//   - A click on a handoff bar asked the dialog for tab 'details', which is
//     no tab id there, so it opened Insights; the hint it meant to show sat
//     on Workflow, hardcoded in German, pointing at a switched-off section.
//   - The successor link and "Estimate now" left the dialog without the
//     unsaved-changes check every other way out has.
//   - The side panel drew its Insights dependency chips as links and passed
//     them no handler, so clicking one did nothing.
//   - Two labels in the dialog were hardcoded ("History", "Nachfolger").
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { NodeModal } from '../components/modals/NodeModal.jsx';
import { QuickEdit } from '../components/views/QuickEdit.jsx';

const tree = [
  { id: 'P1', name: 'Project', status: 'wip', deps: [], assign: [] },
  { id: 'P1.1', name: 'Selected task', status: 'open', best: 2, factor: 1, deps: ['P1.2'], assign: [] },
  { id: 'P1.2', name: 'Before it', status: 'open', best: 1, factor: 1, deps: [], assign: [] },
  { id: 'P1.3', name: 'After it', status: 'open', best: 1, factor: 1, deps: ['P1.1'], assign: [] },
];
const common = {
  tree, members: [], teams: [], taskTemplates: [], sizes: [], customFields: [], scheduled: [],
  cpSet: new Set(), stats: {}, confidence: {}, confReasons: {}, onUpdate: () => {},
};
const wrap = ui => render(<I18nProvider><ThemeProvider>{ui}</ThemeProvider></I18nProvider>);
const selectedTab = () => document.querySelector('[role="tab"][aria-selected="true"]');

beforeEach(() => { cleanup(); localStorage.clear(); localStorage.setItem('planr_lang', 'en'); });
afterEach(() => vi.unstubAllGlobals());

describe('the item dialog', () => {
  it('opened from a handoff bar lands on Details and says what it edits', () => {
    wrap(<NodeModal node={tree[1]} {...common} onClose={() => {}}
      focusRequest={{ section: 'handoff', handoffStage: 1 }} />);
    expect(selectedTab().getAttribute('data-testid')).toBe('nm-tab-overview');
    expect(screen.getByTestId('nm-handoff-hint').textContent).toBe('Handoff stage 2 of this task — the fields here edit the whole task.');
  });

  it('asks before a successor link discards unsaved edits', () => {
    const onNavigate = vi.fn();
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmSpy);
    wrap(<NodeModal node={tree[1]} {...common} onClose={() => {}} onNavigate={onNavigate} />);
    fireEvent.mouseDown(screen.getByTestId('nm-tab-overview'), { button: 0 });
    fireEvent.change(screen.getByDisplayValue('Selected task'), { target: { value: 'Renamed' } });
    fireEvent.mouseDown(screen.getByTestId('nm-tab-timing'), { button: 0 });
    const successors = screen.getByText('Successors').closest('.field');
    fireEvent.click(successors.querySelector('button'));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('asks before "Estimate now" discards unsaved edits', () => {
    const onEstimate = vi.fn();
    vi.stubGlobal('confirm', vi.fn(() => false));
    wrap(<NodeModal node={tree[1]} {...common} onClose={() => {}} onEstimate={onEstimate} />);
    fireEvent.mouseDown(screen.getByTestId('nm-tab-overview'), { button: 0 });
    fireEvent.change(screen.getByDisplayValue('Selected task'), { target: { value: 'Renamed' } });
    fireEvent.mouseDown(screen.getByTestId('nm-tab-effort'), { button: 0 });
    fireEvent.click(screen.getByText('Estimate now'));
    expect(onEstimate).not.toHaveBeenCalled();
  });

  it('labels its History tab in the UI language', () => {
    localStorage.setItem('planr_lang', 'de');
    wrap(<NodeModal node={tree[1]} {...common} onClose={() => {}} />);
    expect(screen.getByTestId('nm-tab-history').textContent).toBe('Verlauf');
  });
});

describe('the side panel', () => {
  it('opens the item a dependency chip on Insights names', () => {
    const onOpenItem = vi.fn();
    wrap(<QuickEdit node={tree[1]} {...common} tab="insights" onTabChange={() => {}} onOpenItem={onOpenItem} />);
    fireEvent.click(screen.getByText('Before it'));
    expect(onOpenItem).toHaveBeenCalledWith('P1.2');
  });
});
