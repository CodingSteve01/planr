import { Icon } from '../../shared/Icon.jsx';
import { SearchSelect } from '../../shared/SearchSelect.jsx';
import { PhaseList } from '../../shared/Phases.jsx';
import { ItemHistoryTimeline } from '../../shared/ItemHistoryTimeline.jsx';
import { leafNodes } from '../../../utils/scheduler.js';

export function WorkflowTab({
  t,
  lang,
  f,
  setF,
  node,
  tree,
  teams,
  members,
  taskTemplates,
  historyEvents,
  viewDay,
  isLeaf,
  focusRefs,
  timeline,
  phases,
  stat,
  progPct,
  leafCountUnder,
  doneUnder,
  stateChanged,
  asOfField,
  donePatch,
  wipStartSeed,
  handlePhaseChange,
  onHistoryChange,
}) {
  return (
    <>
      {/* A package has no status of its own to set — it derives one from
            what is under it, which is why this tab is nearly empty for one.
            Saying so beats leaving a tab with a single button on it and no
            explanation for the space. */}
      {!isLeaf && (
        <div className="field" style={{ maxWidth: 520 }}>
          <label>{t('qe.status')}</label>
          <span style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.5 }}>
            {t('nm.derivedStatus', doneUnder, leafNodes(tree).filter(c => c.id.startsWith(node.id + '.')).length)}
          </span>
        </div>
      )}
      {/* What a package's status is made of. */}
      {!isLeaf && phases.length === 0 && stat && (
        <div
          style={{
            background: 'var(--bg3)',
            borderRadius: 'var(--r)',
            padding: '10px 12px',
            marginBottom: 12,
            fontSize: 12,
            fontFamily: 'var(--mono)',
          }}
        >
          <div style={{ color: 'var(--tx2)', marginBottom: 6 }}>
            {doneUnder}/{leafCountUnder} {t('qe.leafItems')} {t('done')} · {progPct}%
          </div>
          <div className="prog-wrap" style={{ marginBottom: 6 }}>
            <div className="prog-fill" style={{ width: `${progPct}%`, background: progPct >= 100 ? 'var(--gr)' : 'var(--am)' }} />
          </div>
          <div style={{ color: 'var(--tx3)' }}>
            {stat._r > 0 && (
              <span style={{ color: 'var(--am)' }}>
                {stat._r.toFixed(0)}d {t('qe.realisticSuffix')} ·{' '}
              </span>
            )}
            {stat._b > 0 && <span>{stat._b.toFixed(0)}d best</span>}
            {timeline?.period && (
              <span>
                {' '}
                · {timeline.period.start.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB')} →{' '}
                {timeline.period.end.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB')}
              </span>
            )}
            {timeline?.deadline && (
              <span>
                {' '}
                · {t('qe.affectsDeadline')}: {timeline.deadline.start.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB')} →{' '}
                {timeline.deadline.end.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Manual status + progress (leaf without phases only) */}
      {/* Top-aligned, not bottom. A select is 34px tall and a range input
            about 20, so aligning their BOTTOMS put the two labels above them
            at different heights — a ragged row for no reason. */}
      {isLeaf && phases.length === 0 && (
        <div ref={focusRefs.status} className="frow" style={{ alignItems: 'flex-start' }}>
          <div className="field" style={{ flex: '0 0 130px' }}>
            <label>{t('qe.status')}</label>
            <SearchSelect
              value={f.status || 'open'}
              options={[
                { id: 'open', label: t('open') },
                { id: 'wip', label: t('wip') },
                { id: 'done', label: t('done') },
              ]}
              onSelect={v => {
                if (v === 'done')
                  setF(x => {
                    return { ...x, ...donePatch(x) };
                  });
                else if (v === 'open') setF(x => ({ ...x, status: 'open', progress: 0 }));
                else if (v === 'wip')
                  setF(x => ({
                    ...x,
                    status: 'wip',
                    progress: x.progress && x.progress > 0 && x.progress < 100 ? x.progress : 50,
                    completedStart: wipStartSeed(x),
                  }));
              }}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>
              {t('qe.progress')} {progPct}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={progPct}
              onChange={e => {
                const v = +e.target.value;
                setF(x => {
                  const next = { ...x, progress: v };
                  if (v >= 100 && x.status !== 'done') {
                    Object.assign(next, donePatch(x));
                  } else if (v > 0 && v < 100 && x.status !== 'wip') {
                    next.status = 'wip';
                    next.completedStart = wipStartSeed(x);
                  } else if (v === 0 && x.status !== 'open') next.status = 'open';
                  return next;
                });
              }}
              style={{ width: '100%', accentColor: 'var(--ac)', marginTop: 4 }}
            />
          </div>
        </div>
      )}
      {/* Only once there is a change to date: before that the field would
            read as a property of the task, and it is one of the save. */}
      {isLeaf && stateChanged && !viewDay && asOfField}

      {isLeaf && (
        <div ref={focusRefs.phases}>
          <PhaseList
            phases={f.phases}
            templates={taskTemplates}
            teams={teams}
            members={members}
            templateId={f.templateId}
            onChange={handlePhaseChange}
          />
        </div>
      )}

      {/* HandoffPlanEditor disabled (see QuickEdit comment) */}

      {/* The history sits under the fields that write it. It used to be a
            tab of its own, two clicks away from the status it records. */}
      <div style={{ marginTop: 14 }}>
        <ItemHistoryTimeline item={f} events={historyEvents} onEventsChange={onHistoryChange} viewDay={viewDay} />
      </div>

      {/* Dropping is a decision about work at any level, so it is offered for
            a package too. Last on the tab: it is the rarest thing done here,
            and it must not be the first button a click lands on. */}
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          data-testid="drop-toggle"
          className={`btn btn-sm ${f.dropped ? 'btn-pri' : 'btn-sec'}`}
          data-htip={t('nm.dropHint')}
          onClick={() => setF(x => ({ ...x, dropped: x.dropped ? undefined : true }))}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0 }}
        >
          <Icon name={f.dropped ? 'undo' : 'x'} size={13} />
          {f.dropped ? t('nm.dropUndo') : t('nm.dropDo')}
        </button>
        <kbd
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--tx3)',
            border: '1px solid var(--b2)',
            borderRadius: 3,
            padding: '1px 5px',
            flexShrink: 0,
          }}
        >
          0
        </kbd>
      </div>
    </>
  );
}
