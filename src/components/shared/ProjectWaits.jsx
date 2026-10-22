import { fmtDate } from '../../utils/date.js';
import { useT } from '../../i18n.jsx';

// "What is this project waiting on?" — the answer utils/projectWaits.js
// measures, drawn above a project's roadmap rows. It says who decides the end,
// what other work that person does first and what moving it would gain, and
// the tasks that set the end, foreign ones marked. Projects that hold nothing
// back do not appear: a list of everything that does NOT matter is the noise
// this replaces.
export function ProjectWaits({ waits, onOpenItem, onMoveBehind }) {
  const { t } = useT();
  if (!waits || !waits.end) return null;
  const { rootId, bottleneck, chain, path } = waits;
  // Only where there is something to decide: a date to hold, or work ahead
  // of this project that moves its end.
  if (!waits.deadline && !chain.length) return null;
  return <div className="pw" data-testid="project-waits">
    <div className="pw-title">{t('pw.title', rootId)}</div>
    {bottleneck && <div className="pw-row">
      <span className="pw-lbl">{t('pw.decidesEnd')}</span>
      <span>
        {bottleneck.name}{bottleneck.alone ? ` · ${t('pw.alone')}` : ''}
        {' · '}{t('pw.openPt', Math.round(bottleneck.openPt))}
        {' · '}{t('pw.lastTask')} <button className="pw-link" onClick={() => onOpenItem?.(bottleneck.lastTaskId)}>{bottleneck.lastTaskId}</button>
      </span>
    </div>}
    {chain.map((step, i) => <div key={step.ids.join('+')} className="pw-cause" data-pw-cause={step.ids.join('+')}>
      <div className="pw-cause-body">
        <div className="pw-cause-head">
          {i > 0 ? t('pw.thenAlso') + ' ' : ''}
          {step.person
            ? t('pw.causeWithPerson', step.person.name, Math.round(step.pt), step.ids.join(' + '), step.names.join(' + '))
            : t('pw.cause', step.ids.join(' + '), step.names.join(' + '))}
        </div>
        {step.from && step.to && <div className="pw-cause-sub">{fmtDate(step.from)} – {fmtDate(step.to)}</div>}
        <div className="pw-cause-gain">
          {t('pw.gain', fmtDate(step.endAfter), fmtDate(i === 0 ? waits.end : chain[i - 1].endAfter), step.gainDays)}
          {i > 0 && ` · ${t('pw.total', step.totalGainDays)}`}
        </div>
      </div>
      {onMoveBehind && <button className="btn btn-sec btn-xs" onClick={() => onMoveBehind(step.ids, rootId)}>
        {t('pw.moveBehind', step.ids.join(' + '), rootId)}
      </button>}
    </div>)}
    {!chain.length && <div className="pw-none">{t('pw.nothingAhead')}</div>}
    {path.length > 0 && <>
      <div className="pw-sub-title">{t('pw.path', rootId)}</div>
      <div className="pw-path">
        {path.map(p => <div key={p.id} className={`pw-step${p.foreign ? ' foreign' : ''}`} data-pw-step={p.id}>
          <button className="pw-link" onClick={() => onOpenItem?.(p.id)}>{p.id}</button>
          <span className="pw-step-name">{p.count > 1 ? t('pw.tasks', p.count) : p.name}{p.foreign ? ` (${t('pw.foreign')})` : ''}</span>
          <span className="pw-step-who">{p.personName}</span>
          <span className="pw-step-when">{fmtDate(p.startD)} – {fmtDate(p.endD)}</span>
        </div>)}
      </div>
    </>}
  </div>;
}

// The one line the Overview and the report print for a late project.
export function waitsLine(waits, t) {
  const first = waits?.chain?.[0];
  if (!first) return '';
  const last = waits.chain[waits.chain.length - 1];
  return first.person
    ? t('pw.line', first.ids.join(' + '), first.person.name, last.totalGainDays)
    : t('pw.lineNoPerson', first.ids.join(' + '), last.totalGainDays);
}
