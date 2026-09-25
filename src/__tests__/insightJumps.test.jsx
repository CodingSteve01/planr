/** @vitest-environment happy-dom */
// Reported: clicking "People" under Insights in the item dialog did not open
// the place where people are changed (Details), it opened Status.
//
// The assignee picker had moved to Details and the jump table still pointed
// at its old tab — one copy of that table per editor, so nothing noticed.
// These tests click each section and check where the user actually lands:
// on the tab from the shared table, with the field there in focus.
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { NodeModal } from '../components/modals/NodeModal.jsx';
import { QuickEdit } from '../components/views/QuickEdit.jsx';
import { INSIGHT_TARGETS, insightTarget } from '../utils/insightTargets.js';
import { useState } from 'react';

const tree = [
  { id: 'P1', name: 'Project', status: 'wip', deps: [], assign: [] },
  { id: 'P1.1', name: 'Selected task', status: 'open', best: 3, factor: 1.3, team: 'T1', assign: ['m1'], deps: ['P1.2'], due: '2026-11-17' },
  { id: 'P1.2', name: 'Other task', status: 'open', best: 1, factor: 1, deps: [], assign: [] },
];
const members = [{ id: 'm1', name: 'Jonas Fiedler', team: 'T1', cap: 1 }];
const teams = [{ id: 'T1', name: 'Backend', color: '#2563eb' }];
const common = {
  tree, members, teams, taskTemplates: [], sizes: [], customFields: [], scheduled: [],
  cpSet: new Set(), stats: {}, confidence: {}, confReasons: {}, onUpdate: () => {},
};

const wrap = ui => render(<I18nProvider><ThemeProvider>{ui}</ThemeProvider></I18nProvider>);
const selectedTab = () => document.querySelector('[role="tab"][aria-selected="true"]');
const clickSection = label => fireEvent.click(screen.getByText(label, { selector: 'span' }));

describe('Insights section jumps', () => {
  beforeEach(() => { cleanup(); localStorage.clear(); localStorage.setItem('planr_lang', 'en'); });

  it('People opens Details in the item dialog, with the assignee picker focused', () => {
    wrap(<NodeModal node={tree[1]} {...common} onClose={() => {}} />);
    clickSection('People');
    expect(selectedTab().getAttribute('data-testid')).toBe('nm-tab-overview');
    expect(document.activeElement?.getAttribute('placeholder')).toBe('Assign person...');
  });

  it('every clickable section in the item dialog lands on its tab from the shared table', () => {
    const sections = { Timing: 'timing', Effort: 'effort', People: 'people', Dependencies: 'dependencies' };
    for (const [label, id] of Object.entries(sections)) {
      cleanup();
      wrap(<NodeModal node={tree[1]} {...common} onClose={() => {}} />);
      clickSection(label);
      expect(selectedTab().getAttribute('data-testid'), label).toBe(`nm-tab-${INSIGHT_TARGETS[id].tab}`);
      // Landed somewhere the user can type, not on the page body.
      expect(document.activeElement, label).not.toBe(document.body);
    }
  });

  it('People opens the same tab in the side panel as in the dialog', () => {
    function Panel() {
      const [tab, setTab] = useState('insights');
      return <QuickEdit node={tree[1]} {...common} tab={tab} onTabChange={setTab} />;
    }
    wrap(<Panel />);
    clickSection('People');
    expect(selectedTab().textContent).toBe('Details');
    expect(document.activeElement?.getAttribute('placeholder')).toBe('Assign person...');
  });

  it('falls back to Details when the section\'s tab is not shown for this item', () => {
    const packageTabs = [{ id: 'insights' }, { id: 'overview' }, { id: 'workflow' }, { id: 'timing' }];
    expect(insightTarget('effort', packageTabs)).toEqual({ tab: 'overview', focus: null });
    expect(insightTarget('people', packageTabs)).toEqual({ tab: 'overview', focus: 'assign' });
    expect(insightTarget('unknown', packageTabs)).toEqual({ tab: 'overview', focus: null });
  });
});
