// Bulk-edit body — the same content rendered into the Tree sidebar and the
// standalone bulk-edit modal. Every edit writes the whole tree through `setD`;
// the selection and the active tab live in `App`, because the sidebar and the
// tree list read them too.
import { useMemo } from 'react';
import { Icon } from '../shared/Icon.jsx';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { LazyInput } from '../shared/LazyInput.jsx';
import { bulkFacts } from '../../app/bulkFacts.js';
import { statusChangePatch } from '../../utils/completion.js';
import { instantiateTemplatePhases } from '../../utils/phases.js';
import { derivePhaseStatus } from '../../utils/scheduler.js';
import { teamForAssignment } from '../../utils/memberTeams.js';

const mixedSuffix = (common, _t) => (common == null ? ` (${_t('bulk.mixed')})` : '');

function batchTabsFor(facts, _t) {
  const { allLeaf, allDeadlineScoped } = facts;
  return [
    { id: 'overview', label: _t('qe.tab.overview') },
    { id: 'workflow', label: _t('qe.tab.workflow') },
    ...(allLeaf ? [{ id: 'effort', label: _t('qe.tab.effort') }] : []),
    ...(allLeaf || allDeadlineScoped ? [{ id: 'timing', label: _t('qe.tab.timing') }] : []),
  ];
}

// A field whose label says "(mixed)" when the selection disagrees.
function MixedField({ label, common, _t, children }) {
  return (
    <div className="field">
      <label>
        {label}
        {mixedSuffix(common, _t)}
      </label>
      {children}
    </div>
  );
}

function ToggleRow({ checked, disabled, onChange, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <label className="toggle">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
        <span className="slider" />
      </label>
      {children}
    </div>
  );
}

function phaseDot(common) {
  // One geometric triple — filled / half / ring — rather than a dingbat
  // check that renders as an emoji on some platforms.
  if (common === 'done') return '●';
  if (common === 'wip') return '◐';
  return common === 'open' ? '○' : '?';
}

function phaseDotColor(common) {
  if (common === 'done') return 'var(--st-done)';
  return common === 'wip' ? 'var(--ac)' : 'var(--tx3)';
}

function nextPhaseStatus(common) {
  if (common === 'open') return 'wip';
  return common === 'wip' ? 'done' : 'open';
}

function withPhaseStatus(r, i, next) {
  const newPhases = r.phases.map((p, j) => (j === i ? { ...p, status: next } : p));
  // Same derivation as the single editors: a wip phase
  // counts for its share, not for nothing, so one click
  // gives one progress figure wherever it is made.
  const derived = derivePhaseStatus(newPhases);
  return {
    ...r,
    phases: newPhases,
    ...(derived ? { status: derived.status, progress: derived.progress } : {}),
  };
}

function PhaseRow({ ph, i, withPhases, setPhaseStatus, _t }) {
  const statuses = withPhases.map(r => r.phases[i].status);
  const common = statuses.every(s => s === statuses[0]) ? statuses[0] : null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
      <span
        style={{
          cursor: 'pointer',
          fontSize: 13,
          color: phaseDotColor(common),
          width: 18,
          textAlign: 'center',
          flexShrink: 0,
          userSelect: 'none',
        }}
        onClick={() => setPhaseStatus(i, nextPhaseStatus(common))}
      >
        {phaseDot(common)}
      </span>
      <span
        style={{
          fontSize: 12,
          color: common === 'done' ? 'var(--tx3)' : 'var(--tx)',
          textDecoration: common === 'done' ? 'line-through' : 'none',
        }}
      >
        {ph.name}
      </span>
      {common == null && <span style={{ fontSize: 10, color: 'var(--tx3)' }}>({_t('bulk.mixed')})</span>}
    </div>
  );
}

function PhasesField({ selItems, edit, _t }) {
  const withPhases = selItems.filter(r => r.phases?.length);
  if (!withPhases.length) return null;
  const refPhases = withPhases[0].phases;
  const allSameStructure =
    withPhases.length === selItems.length &&
    withPhases.every(r => r.phases.length === refPhases.length && r.phases.every((p, i) => p.name === refPhases[i].name));
  if (!allSameStructure) return null;
  const setPhaseStatus = (i, next) => edit(r => (r.phases?.[i] ? withPhaseStatus(r, i, next) : r));
  return (
    <div className="field">
      <label>{_t('ph.phases')}</label>
      {refPhases.map((ph, i) => (
        <PhaseRow key={i} ph={ph} i={i} withPhases={withPhases} setPhaseStatus={setPhaseStatus} _t={_t} />
      ))}
    </div>
  );
}

function TemplateField({ templates, edit, _t }) {
  if (templates.length === 0) return null;
  return (
    <div className="field">
      <label>{_t('ph.applyTemplate')}</label>
      <SearchSelect
        options={templates.map(tp => ({ id: tp.id, label: tp.name }))}
        onSelect={tplId => {
          const tpl = templates.find(tp => tp.id === tplId);
          if (!tpl) return;
          edit(r => {
            const phases = instantiateTemplatePhases(tpl.phases);
            return { ...r, phases, templateId: tplId, status: 'open', progress: 0 };
          });
        }}
        placeholder={_t('ph.applyTemplate')}
      />
    </div>
  );
}

function StatusField({ facts, tree, multiSel, setD, _t }) {
  return (
    <MixedField label={_t('qe.status')} common={facts.common.status} _t={_t}>
      <SearchSelect
        value={facts.common.status || ''}
        options={[
          { id: 'open', label: _t('open') },
          { id: 'wip', label: _t('wip') },
          { id: 'done', label: _t('done') },
        ]}
        onSelect={v =>
          setD(
            'tree',
            tree.map(r => {
              // The single editors' rules, not a bare status write: done stamps
              // the completion dates and 100 %, open resets progress, wip seeds
              // the start. A task with phases has no status of its own to set —
              // its phases decide it — so it is left alone, as the single
              // editors do by hiding the field.
              if (!multiSel.has(r.id) || r.phases?.length) return r;
              return { ...r, ...statusChangePatch(r, v) };
            }),
          )
        }
        placeholder={_t('bulk.chooseStatus')}
      />
    </MixedField>
  );
}

function OverviewTab({ facts, b }) {
  const { _t, edit, tree, multiSel, setD, templates } = b;
  const { allLeaf, anyNonRoot, common, selItems } = facts;
  return (
    <>
      {allLeaf && <StatusField facts={facts} tree={tree} multiSel={multiSel} setD={setD} _t={_t} />}
      <MixedField label={_t('qe.notes')} common={common.note} _t={_t}>
        <LazyInput value={common.note ?? ''} onCommit={v => edit(r => ({ ...r, note: v }))} placeholder={_t('bulk.notePlaceholder')} />
      </MixedField>
      {anyNonRoot && (
        <>
          <TemplateField templates={templates} edit={edit} _t={_t} />
          <PhasesField selItems={selItems} edit={edit} _t={_t} />
        </>
      )}
    </>
  );
}

function AssigneeField({ selItems, members, edit, _t }) {
  const commonAssigns = selItems[0]?.assign?.filter(a => selItems.every(r => (r.assign || []).includes(a))) || [];
  return (
    <div className="field">
      <label>{_t('qe.assignee')}</label>
      {commonAssigns.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {commonAssigns.map(a => {
            const m = members.find(x => x.id === a);
            return (
              <span key={a} className="tag">
                {m?.name || a}
                <span
                  className="tag-x"
                  data-htip={_t('bulk.removeFromSelected')}
                  onClick={() => edit(r => ({ ...r, assign: (r.assign || []).filter(x => x !== a) }))}
                >
                  <Icon name="x" size={9} />
                </span>
              </span>
            );
          })}
        </div>
      )}
      <SearchSelect
        options={members.filter(m => !commonAssigns.includes(m.id)).map(m => ({ id: m.id, label: m.name || m.id }))}
        onSelect={v => {
          const m = members.find(x => x.id === v);
          edit(r => ({ ...r, assign: [...new Set([...(r.assign || []), v])], team: teamForAssignment(m, r.team) }));
        }}
        placeholder={_t('qe.assignPerson')}
      />
    </div>
  );
}

function FlagField({ label, common, tip, field, edit, _t }) {
  return (
    <div className="field">
      <label>
        {label}
        {mixedSuffix(common, _t)}
      </label>
      <ToggleRow checked={common === true} onChange={e => edit(r => ({ ...r, [field]: e.target.checked || undefined }))}>
        <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{tip}</span>
      </ToggleRow>
    </div>
  );
}

function WorkflowTab({ facts, b }) {
  const { _t, edit, members, teams } = b;
  const { allLeaf, common, selItems } = facts;
  return (
    <>
      <MixedField label={_t('qe.team')} common={common.team} _t={_t}>
        <SearchSelect
          value={common.team || ''}
          options={teams.map(t => ({ id: t.id, label: t.name }))}
          onSelect={v => edit(r => ({ ...r, team: v }))}
          placeholder={_t('bulk.chooseTeam')}
          allowEmpty
        />
      </MixedField>
      <AssigneeField selItems={selItems} members={members} edit={edit} _t={_t} />
      {allLeaf && (
        <FlagField
          label={_t('qe.parallel') || 'Parallel'}
          common={common.parallel}
          tip={_t('qe.parallelTip')}
          field="parallel"
          edit={edit}
          _t={_t}
        />
      )}
      {allLeaf && (
        <FlagField label={_t('qe.teamLock')} common={common.teamLock} tip={_t('qe.teamLockTip')} field="teamLock" edit={edit} _t={_t} />
      )}
    </>
  );
}

function NumberField({ label, common, step, min, field, edit, _t }) {
  return (
    <MixedField label={label} common={common} _t={_t}>
      <LazyInput type="number" min={min} step={step} value={common ?? ''} onCommit={v => edit(r => ({ ...r, [field]: +v }))} />
    </MixedField>
  );
}

function ConfidenceField({ common, edit, _t }) {
  return (
    <div className="field">
      <label>{_t('qe.confidence')}</label>
      <div style={{ display: 'flex', gap: 3 }}>
        {[
          ['', _t('auto')],
          ['committed', '●'],
          ['estimated', '◐'],
          ['exploratory', '○'],
        ].map(([v, l]) => (
          <button
            key={v}
            className={`btn btn-sec btn-xs${common === v ? ' active' : ''}`}
            style={{ flex: 1, fontSize: 11 }}
            onClick={() => edit(r => ({ ...r, confidence: v }))}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function EffortTab({ facts, b }) {
  const { _t, edit } = b;
  const { allLeaf, common } = facts;
  return (
    <>
      {allLeaf && (
        <div className="frow">
          <NumberField label={_t('qe.bestDays')} common={common.best} min="0" step="0.1" field="best" edit={edit} _t={_t} />
          <NumberField label={_t('qe.factor')} common={common.factor} min="1" step="0.1" field="factor" edit={edit} _t={_t} />
        </div>
      )}
      <MixedField label={_t('qe.priority')} common={common.prio} _t={_t}>
        <SearchSelect
          value={common.prio ? String(common.prio) : ''}
          options={[
            { id: '1', label: `1 ${_t('critical')}` },
            { id: '2', label: `2 ${_t('high')}` },
            { id: '3', label: `3 ${_t('medium')}` },
            { id: '4', label: `4 ${_t('low')}` },
          ]}
          onSelect={v => edit(r => ({ ...r, prio: +v }))}
          placeholder={_t('bulk.choosePriority')}
        />
      </MixedField>
      <ConfidenceField common={common.confidence} edit={edit} _t={_t} />
    </>
  );
}

function DateField({ label, common, onCommit, _t }) {
  return (
    <MixedField label={label} common={common} _t={_t}>
      <LazyInput type="date" value={common ?? ''} onCommit={onCommit} />
    </MixedField>
  );
}

function DateFields({ common, edit, _t }) {
  return (
    <div className="frow">
      <DateField label={_t('qe.pinnedStart')} common={common.pinnedStart} onCommit={v => edit(r => ({ ...r, pinnedStart: v }))} _t={_t} />
      <DateField
        label={_t('qe.completedStart')}
        common={common.completedStart}
        onCommit={v => edit(r => ({ ...r, completedStart: v }))}
        _t={_t}
      />
      <DateField
        label={_t('qe.completedEnd')}
        common={common.completedEnd}
        onCommit={v => edit(r => ({ ...r, completedEnd: v, completedAt: v || r.completedAt }))}
        _t={_t}
      />
      <DateField
        label={_t('qe.completedAt')}
        common={common.completedAt}
        onCommit={v => edit(r => ({ ...r, completedAt: v, completedEnd: v || r.completedEnd }))}
        _t={_t}
      />
    </div>
  );
}

function deadlineTextColor(excluded, relevant) {
  if (excluded) return 'var(--tx3)';
  return relevant === false ? 'var(--am)' : 'var(--tx2)';
}

function DeadlineField({ facts, edit, _t }) {
  const { commonDeadlineRelevant, deadlineParentExcluded } = facts;
  return (
    <div className="field">
      <label>
        {_t('qe.affectsDeadline')}
        {mixedSuffix(commonDeadlineRelevant, _t)}
      </label>
      <ToggleRow
        checked={commonDeadlineRelevant !== false}
        disabled={deadlineParentExcluded}
        onChange={e => edit(r => ({ ...r, deadlineRelevant: e.target.checked ? undefined : false }))}
      >
        <span style={{ fontSize: 12, color: deadlineTextColor(deadlineParentExcluded, commonDeadlineRelevant) }}>
          {commonDeadlineRelevant === false ? _t('no') : _t('yes')}
        </span>
      </ToggleRow>
    </div>
  );
}

function TimingTab({ facts, b }) {
  const { _t, edit } = b;
  return (
    <>
      {facts.allLeaf && <DateFields common={facts.common} edit={edit} _t={_t} />}
      {facts.allDeadlineScoped && <DeadlineField facts={facts} edit={edit} _t={_t} />}
    </>
  );
}

const TAB_BODIES = { overview: OverviewTab, workflow: WorkflowTab, effort: EffortTab, timing: TimingTab };

export function BulkEditBody({ plan, view, handlers, _t }) {
  const { data, members, teams, tree } = plan;
  const { multiSel, setMultiSel, setSideTab, sideTab } = view;
  const { setD } = handlers;
  const facts = useMemo(() => bulkFacts(tree, multiSel), [tree, multiSel]);
  if (multiSel.size === 0) return null;
  const batchTabs = batchTabsFor(facts, _t);
  const bTab = batchTabs.find(bt => bt.id === sideTab) ? sideTab : 'overview';
  // Applies `fn` to every selected item and writes the tree back.
  const edit = fn =>
    setD(
      'tree',
      tree.map(r => (multiSel.has(r.id) ? fn(r) : r)),
    );
  const b = { _t, edit, members, teams, tree, multiSel, setD, templates: data.taskTemplates || [] };
  const Body = TAB_BODIES[bTab];
  return (
    <div className="side-body">
      <p className="helper" style={{ marginBottom: 10 }}>
        {_t('bulk.hint')}
      </p>
      <div className="qe-tabs" role="tablist">
        {batchTabs.map(bt => (
          <button
            key={bt.id}
            role="tab"
            aria-selected={bTab === bt.id}
            className={`qe-tab${bTab === bt.id ? ' active' : ''}`}
            onClick={() => setSideTab(bt.id)}
          >
            {bt.label}
          </button>
        ))}
      </div>
      <Body facts={facts} b={b} />
      <hr className="divider" />
      <button className="btn btn-sec btn-sm" style={{ width: '100%', marginBottom: 6 }} onClick={() => setMultiSel(new Set())}>
        {_t('bulk.clearSelection')}
      </button>
    </div>
  );
}
