/** @vitest-environment happy-dom */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { I18nProvider } from '../../../../i18n.jsx';
import { HandoffSection } from '../HandoffSection.jsx';
import { TimingSection } from '../TimingSection.jsx';
import { SubtasksSection } from '../EffortSection.jsx';
import { NetEmptyState } from '../../../views/net/NetEmptyState.jsx';

// Every fixed string of these four spots follows the language switch.

const inLang = (lang, ui) => {
  localStorage.setItem('planr_lang', lang);
  return render(<I18nProvider>{ui}</I18nProvider>);
};
const text = () => document.body.textContent;

afterEach(() => {
  cleanup();
  localStorage.removeItem('planr_lang');
});

const seg = (o = {}) => ({ personName: 'Anna Noor', effort: 2, startD: '2025-01-06', endD: '2025-01-10', ...o });
const handoff = (
  <HandoffSection
    node={{ id: '1' }}
    sc={{
      segments: [seg({ offboarded: true }), seg({ personName: 'Ben Ortiz', handoff: true })],
      truncatedByOffboard: { remainingEffort: 3.5, offboardDate: '2025-02-01' },
    }}
  />
);

describe('HandoffSection', () => {
  it('English', () => {
    inLang('en', handoff);
    expect(screen.getByText('Handoff chain')).toBeTruthy();
    expect(screen.getByText('offboarded')).toBeTruthy();
    expect(text()).toContain('3.5 person-days without a replacement after 2025-02-01');
  });

  it('German', () => {
    inLang('de', handoff);
    expect(screen.getByText('Übergabekette')).toBeTruthy();
    expect(screen.getByText('ausgeschieden')).toBeTruthy();
    expect(text()).toContain('3.5 PT ohne Nachbesetzung nach 2025-02-01');
    expect(text()).not.toContain('Handoff chain');
  });
});

describe('TimingSection', () => {
  const timing = (
    <TimingSection node={{ id: '2' }} sc={{ blockedBy: { id: '1', endD: '2025-01-10' } }} scheduled={[]} sec={() => undefined} />
  );

  it('labels the blocker in both languages, without a fallback', () => {
    inLang('en', timing);
    expect(screen.getByText('Waiting for')).toBeTruthy();
    cleanup();
    inLang('de', timing);
    expect(screen.getByText('Wartet auf')).toBeTruthy();
  });
});

describe('SubtasksSection (effort)', () => {
  const effort = <SubtasksSection doneUnder={1} wipUnder={0} openUnder={2} leafCount={3} effort={12} effortBest={8} />;

  it('writes the best-case days per language', () => {
    inLang('en', effort);
    expect(text()).toContain('(8d best)');
    cleanup();
    inLang('de', effort);
    expect(text()).toContain('(8d Best)');
    expect(text()).not.toContain('d best');
  });
});

describe('NetEmptyState', () => {
  it('English', () => {
    inLang('en', <NetEmptyState isFiltered={false} />);
    expect(screen.getByText('No items yet')).toBeTruthy();
    cleanup();
    inLang('en', <NetEmptyState isFiltered={false} onAddNode={() => {}} />);
    expect(screen.getByRole('button', { name: '+ Add first item' })).toBeTruthy();
    cleanup();
    inLang('en', <NetEmptyState isFiltered />);
    expect(screen.getByText('No items match this filter')).toBeTruthy();
    expect(screen.getByText('Adjust the root or team filter to widen the graph.')).toBeTruthy();
  });

  it('German', () => {
    inLang('de', <NetEmptyState isFiltered={false} />);
    expect(screen.getByText('Noch keine Items')).toBeTruthy();
    cleanup();
    inLang('de', <NetEmptyState isFiltered={false} onAddNode={() => {}} />);
    expect(screen.getByRole('button', { name: '+ Erstes Item anlegen' })).toBeTruthy();
    cleanup();
    inLang('de', <NetEmptyState isFiltered />);
    expect(screen.getByText('Kein Item passt zu diesem Filter')).toBeTruthy();
    expect(screen.getByText('Passe den Wurzel- oder Team-Filter an, um den Graphen zu erweitern.')).toBeTruthy();
  });
});
