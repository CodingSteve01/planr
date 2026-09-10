import { useMemo, useState } from 'react';
import { useT } from '../../i18n.jsx';
import { useDialogShortcuts } from '../../utils/useDialogShortcuts.js';
import { DEFAULT_CUSTOM_FIELDS } from '../../utils/customFields.js';
import { detectJiraFieldId, linkHealth, parseJiraTable, reconcile, statusPatches } from '../../utils/jiraSync.js';

const STATUS_LABEL = { open: '○', wip: '◐', done: '✓' };
const STATUS_COLOR = { open: 'var(--tx3)', wip: 'var(--am)', done: 'var(--gr)' };
const MAX_ROWS = 14;

function Tile({ value, label, tone = 'var(--tx2)', tip }) {
  return (
    <div data-htip={tip} style={{
      flex: '1 1 110px', minWidth: 100, background: 'var(--bg3)', border: '1px solid var(--b)',
      borderRadius: 'var(--r)', padding: '7px 10px', cursor: tip ? 'help' : 'default',
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: tone, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
    </div>
  );
}

function StatusPill({ status, text }) {
  return (
    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: STATUS_COLOR[status] || 'var(--tx3)' }}>
      {STATUS_LABEL[status] || '·'} {text || status}
    </span>
  );
}

// One drift/health row. Kept flat and dense on purpose — this list is read as
// a worklist, not browsed.
function Row({ id, name, right, onClick, checked, onToggle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', fontSize: 10 }}>
      {onToggle && (
        <input type="checkbox" checked={!!checked} onChange={onToggle}
          style={{ flexShrink: 0, cursor: 'pointer' }} />
      )}
      <span onClick={onClick}
        style={{ fontFamily: 'var(--mono)', color: 'var(--ac)', width: 74, flexShrink: 0, cursor: onClick ? 'pointer' : 'default' }}>
        {id}
      </span>
      <span onClick={onClick}
        style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: 'var(--tx2)', cursor: onClick ? 'pointer' : 'default' }}>
        {name}
      </span>
      {right}
    </div>
  );
}

function Section({ title, count, tone, hint, children }) {
  if (!count) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: tone }}>{title}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>{count}</span>
      </div>
      {hint && <div style={{ fontSize: 9, color: 'var(--tx3)', marginBottom: 4, fontStyle: 'italic' }}>{hint}</div>}
      <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '5px 9px' }}>{children}</div>
    </div>
  );
}

export function JiraSyncModal({ tree = [], customFields, onApplyStatus, onOpenItem, onClose }) {
  const { t } = useT();
  useDialogShortcuts(onClose);
  const fields = customFields?.length ? customFields : DEFAULT_CUSTOM_FIELDS;
  const jiraFieldId = useMemo(() => detectJiraFieldId(fields, tree), [fields, tree]);
  const fieldName = fields.find(f => f.id === jiraFieldId)?.name || jiraFieldId;

  const [section, setSection] = useState('check');
  const [text, setText] = useState('');
  // Ids the user has *un*checked. Defaulting to "all accepted" means the
  // common case (take everything Jira says) is one click, and an inverted set
  // survives re-parsing the paste without resurrecting stale selections.
  const [rejected, setRejected] = useState(() => new Set());

  const health = useMemo(() => linkHealth(tree, jiraFieldId), [tree, jiraFieldId]);
  const parsed = useMemo(() => (text.trim() ? parseJiraTable(text) : null), [text]);
  const result = useMemo(
    () => (parsed?.rows?.length ? reconcile({ tree, rows: parsed.rows, jiraFieldId }) : null),
    [parsed, tree, jiraFieldId],
  );

  const statusDiff = result?.statusDiff || [];
  const acceptedIds = useMemo(
    () => new Set(statusDiff.map(d => d.id).filter(id => !rejected.has(id))),
    [statusDiff, rejected],
  );
  const toggle = id => setRejected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Deliberately no onClose() here: the host swaps this dialog for the task
  // editor, and closing afterwards would race that swap and leave nothing open.
  const openItem = id => onOpenItem?.(id);

  const apply = () => {
    const patches = statusPatches(statusDiff, acceptedIds, tree);
    if (!patches.length) return;
    onApplyStatus?.(patches);
    onClose();
  };

  const parseNote = (() => {
    if (!parsed) return null;
    if (parsed.error === 'noKeyColumn') return { tone: 'var(--re)', text: t('js.errNoKey') };
    if (parsed.error === 'noRows') return { tone: 'var(--re)', text: t('js.errNoRows') };
    const plural = (base, n) => t(n === 1 ? `${base}1` : base, n);
    return {
      tone: 'var(--tx3)',
      text: plural('js.parsed', parsed.rows.length)
        + (parsed.skipped ? ` · ${plural('js.skipped', parsed.skipped)}` : ''),
    };
  })();

  return <div className="overlay" onClick={onClose}>
    <div className="modal modal-lg fade" onClick={e => e.stopPropagation()}>
      <h2>{t('js.title')}</h2>
      <p className="helper" style={{ marginTop: -6, marginBottom: 10 }}>
        {jiraFieldId
          ? t('js.fieldHint', fieldName)
          : <span style={{ color: 'var(--am)' }}>{t('js.noField')}</span>}
      </p>

      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        <button className={`btn btn-xs ${section === 'check' ? 'btn-pri' : 'btn-sec'}`}
          style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setSection('check')}>{t('js.tabCheck')}</button>
        <button className={`btn btn-xs ${section === 'compare' ? 'btn-pri' : 'btn-sec'}`}
          style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setSection('compare')}>{t('js.tabCompare')}</button>
      </div>

      {/* ── Link health: answerable from the plan alone, no paste needed ── */}
      {section === 'check' && <>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          <Tile value={health.linked.length} label={t('js.tileLinked')} tone="var(--gr)" tip={t('js.tileLinkedTip')} />
          <Tile value={health.unlinkedOpen.length} label={t('js.tileUnlinked')}
            tone={health.unlinkedOpen.length ? 'var(--am)' : 'var(--tx3)'} tip={t('js.tileUnlinkedTip')} />
          <Tile value={health.duplicates.length} label={t('js.tileDupes')}
            tone={health.duplicates.length ? 'var(--re)' : 'var(--tx3)'} tip={t('js.tileDupesTip')} />
        </div>

        <div style={{ maxHeight: 320, overflow: 'auto' }}>
          <Section title={t('js.dupes')} count={health.duplicates.length} tone="var(--re)" hint={t('js.dupesHint')}>
            {health.duplicates.map(dupe => (
              <Row key={dupe.key} id={dupe.key} name={dupe.ids.join(' · ')}
                right={<button className="btn btn-ghost btn-xs" style={{ padding: '0 6px', fontSize: 9 }}
                  onClick={() => openItem(dupe.ids[0])}>{t('js.open')}</button>} />
            ))}
          </Section>

          <Section title={t('js.unlinkedOpen')} count={health.unlinkedOpen.length} tone="var(--am)" hint={t('js.unlinkedHint')}>
            {health.unlinkedOpen.slice(0, MAX_ROWS).map(row => (
              <Row key={row.id} id={row.id} name={row.name} onClick={() => openItem(row.id)}
                right={<StatusPill status={row.status} />} />
            ))}
            {health.unlinkedOpen.length > MAX_ROWS && (
              <div style={{ fontSize: 9, color: 'var(--tx3)', textAlign: 'center', paddingTop: 3 }}>
                {t('js.more', health.unlinkedOpen.length - MAX_ROWS)}
              </div>
            )}
          </Section>

          {!health.duplicates.length && !health.unlinkedOpen.length && (
            <div className="empty" style={{ padding: '24px 0' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>✓</div>
              {t('js.allClean')}
            </div>
          )}
        </div>
      </>}

      {/* ── Reconcile against a pasted Jira table ── */}
      {section === 'compare' && <>
        <div className="field">
          <label>{t('js.pasteLabel')}</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t('js.pastePlaceholder')}
            spellCheck={false}
            style={{ width: '100%', minHeight: 88, fontFamily: 'var(--mono)', fontSize: 10,
              background: 'var(--bg)', color: 'var(--tx2)', border: '1px solid var(--b)',
              borderRadius: 'var(--r)', padding: 8, resize: 'vertical' }} />
          {parseNote && (
            <div style={{ fontSize: 9, color: parseNote.tone, marginTop: 3 }}>{parseNote.text}</div>
          )}
        </div>

        {result && (
          <div style={{ maxHeight: 300, overflow: 'auto' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              <Tile value={result.matched} label={t('js.tileMatched')} tone="var(--gr)" />
              <Tile value={statusDiff.length} label={t('js.tileStatusDiff')}
                tone={statusDiff.length ? 'var(--am)' : 'var(--tx3)'} />
              <Tile value={result.missingInPlanr.length} label={t('js.tileOnlyJira')}
                tone={result.missingInPlanr.length ? 'var(--ac)' : 'var(--tx3)'} />
              <Tile value={result.missingInJira.length} label={t('js.tileOnlyPlanr')}
                tone={result.missingInJira.length ? 'var(--ac)' : 'var(--tx3)'} />
            </div>

            <Section title={t('js.statusDiff')} count={statusDiff.length} tone="var(--am)" hint={t('js.statusDiffHint')}>
              {statusDiff.map(diff => (
                <Row key={diff.id + diff.key} id={diff.id} name={diff.name}
                  checked={acceptedIds.has(diff.id)} onToggle={() => toggle(diff.id)}
                  onClick={() => openItem(diff.id)}
                  right={<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    <StatusPill status={diff.planrStatus} />
                    <span style={{ color: 'var(--tx3)' }}>→</span>
                    <StatusPill status={diff.target} text={diff.jiraStatus} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--tx3)', width: 62, textAlign: 'right' }}>{diff.key}</span>
                  </span>} />
              ))}
            </Section>

            <Section title={t('js.summaryDrift')} count={result.summaryDrift.length} tone="var(--tx2)" hint={t('js.summaryDriftHint')}>
              {result.summaryDrift.slice(0, MAX_ROWS).map(row => (
                <Row key={row.id} id={row.id} name={row.name} onClick={() => openItem(row.id)}
                  right={<span style={{ fontSize: 9, color: 'var(--tx3)', maxWidth: 240, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('js.inJira')}: {row.jiraSummary}</span>} />
              ))}
            </Section>

            <Section title={t('js.onlyJira')} count={result.missingInPlanr.length} tone="var(--ac)" hint={t('js.onlyJiraHint')}>
              {result.missingInPlanr.slice(0, MAX_ROWS).map(row => (
                <Row key={row.key} id={row.key} name={row.summary || '—'}
                  right={<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    {row.knownPlanrId && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--am)' }}>
                      {t('js.linkTo', row.knownPlanrId)}
                    </span>}
                    {row.mapped && <StatusPill status={row.mapped} text={row.status} />}
                  </span>} />
              ))}
              {result.missingInPlanr.length > MAX_ROWS && (
                <div style={{ fontSize: 9, color: 'var(--tx3)', textAlign: 'center', paddingTop: 3 }}>
                  {t('js.more', result.missingInPlanr.length - MAX_ROWS)}
                </div>
              )}
            </Section>

            <Section title={t('js.onlyPlanr')} count={result.missingInJira.length} tone="var(--ac)" hint={t('js.onlyPlanrHint')}>
              {result.missingInJira.slice(0, MAX_ROWS).map(row => (
                <Row key={row.id} id={row.id} name={row.name} onClick={() => openItem(row.id)}
                  right={<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <StatusPill status={row.status} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--tx3)', width: 62, textAlign: 'right' }}>{row.key}</span>
                  </span>} />
              ))}
            </Section>

            {!statusDiff.length && !result.summaryDrift.length && !result.missingInPlanr.length && !result.missingInJira.length && (
              <div className="empty" style={{ padding: '20px 0' }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>✓</div>
                {t('js.inSync')}
              </div>
            )}
          </div>
        )}
      </>}

      <div className="modal-footer">
        <button className="btn btn-sec" onClick={onClose}>{t('rv.close')}</button>
        <div style={{ flex: 1 }} />
        {section === 'compare' && (
          <button className="btn btn-pri" disabled={!acceptedIds.size} onClick={apply}
            data-htip={t('js.applyTip')}>
            {t('js.apply', acceptedIds.size)}
          </button>
        )}
      </div>
    </div>
  </div>;
}
