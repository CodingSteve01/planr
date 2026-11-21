import { Icon } from '../../shared/Icon.jsx';
import { S_DOT } from '../../../utils/statusMarks.js';
import { JiraRow, JiraSection } from './JiraParts.jsx';
import { useT } from '../../../i18n.jsx';

const JIRA_MAX_ROWS = 8;

function JiraStatusDiff({ jiraStatusDiff, jiraAccepted, toggleJiraRow, applyJiraDiffs, onOpenItem }) {
  const { t } = useT();
  return (
    <JiraSection title={t('js.statusDiff')} tone="var(--am)" count={jiraStatusDiff.length} hint={t('js.statusDiffHint')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {jiraStatusDiff.map(diff => (
          <div
            key={diff.id + diff.key}
            data-testid={`bv-jira-diff-${diff.id}`}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', cursor: 'pointer' }}
            onClick={() => onOpenItem?.(diff.id)}
          >
            <input
              type="checkbox"
              checked={jiraAccepted.has(diff.id)}
              onClick={e => e.stopPropagation()}
              onChange={() => toggleJiraRow(diff.id)}
            />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', fontWeight: 600, flexShrink: 0, minWidth: 70 }}>
              {diff.id}
            </span>
            <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{diff.name}</span>
            <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
              {S_DOT[diff.planrStatus]} → {S_DOT[diff.target]} {diff.jiraStatus}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', width: 62, textAlign: 'right', flexShrink: 0 }}>
              {diff.key}
            </span>
          </div>
        ))}
        <button
          className="btn btn-pri btn-xs"
          style={{ alignSelf: 'flex-start', padding: '3px 10px', fontSize: 12, marginTop: 4 }}
          disabled={!jiraAccepted.size}
          data-testid="bv-jira-apply"
          onClick={() => applyJiraDiffs(jiraStatusDiff, jiraAccepted)}
          data-htip={t('js.applyTip')}
        >
          {t('js.apply', jiraAccepted.size)}
        </button>
      </div>
    </JiraSection>
  );
}

function JiraPasteBox({ jiraBoxRef, jiraText, setJiraText, jiraParsed }) {
  const { t } = useT();
  return (
    <div className="field">
      <label>{t('js.pasteLabel')}</label>
      <textarea
        ref={jiraBoxRef}
        data-testid="jira-paste"
        value={jiraText}
        onChange={e => setJiraText(e.target.value)}
        placeholder={t('js.pastePlaceholder')}
        spellCheck={false}
        style={{
          width: '100%',
          minHeight: 72,
          fontFamily: 'var(--mono)',
          fontSize: 11,
          background: 'var(--bg)',
          color: 'var(--tx2)',
          border: '1px solid var(--b)',
          borderRadius: 'var(--r)',
          padding: 8,
          resize: 'vertical',
        }}
      />
      {jiraParsed && (
        <div style={{ fontSize: 10, color: jiraParsed.error ? 'var(--re)' : 'var(--tx3)', marginTop: 3 }}>
          {jiraParsed.error === 'noKeyColumn'
            ? t('js.errNoKey')
            : jiraParsed.error === 'noRows'
              ? t('js.errNoRows')
              : `${t(jiraParsed.rows.length === 1 ? 'js.parsed1' : 'js.parsed', jiraParsed.rows.length)}${jiraParsed.skipped ? ` · ${t(jiraParsed.skipped === 1 ? 'js.skipped1' : 'js.skipped', jiraParsed.skipped)}` : ''}`}
        </div>
      )}
    </div>
  );
}

function JiraHealthTiles({ jiraHealth, jiraResult, jiraStatusDiff }) {
  const { t } = useT();
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--gr)' }} data-htip={t('js.tileLinkedTip')}>
        {jiraHealth.linked.length} {t('js.tileLinked')}
      </span>
      <span
        style={{ fontSize: 12, color: jiraHealth.unlinkedOpen.length ? 'var(--am)' : 'var(--tx3)' }}
        data-htip={t('js.tileUnlinkedTip')}
      >
        {jiraHealth.unlinkedOpen.length} {t('js.tileUnlinked')}
      </span>
      <span style={{ fontSize: 12, color: jiraHealth.duplicates.length ? 'var(--re)' : 'var(--tx3)' }} data-htip={t('js.tileDupesTip')}>
        {jiraHealth.duplicates.length} {t('js.tileDupes')}
      </span>
      {jiraResult && (
        <>
          <span style={{ fontSize: 12, color: 'var(--gr)' }}>
            {jiraResult.matched} {t('js.tileMatched')}
          </span>
          <span style={{ fontSize: 12, color: jiraStatusDiff.length ? 'var(--am)' : 'var(--tx3)' }}>
            {jiraStatusDiff.length} {t('js.tileStatusDiff')}
          </span>
          <span style={{ fontSize: 12, color: jiraResult.missingInPlanr.length ? 'var(--ac)' : 'var(--tx3)' }}>
            {jiraResult.missingInPlanr.length} {t('js.tileOnlyJira')}
          </span>
          <span style={{ fontSize: 12, color: jiraResult.missingInJira.length ? 'var(--ac)' : 'var(--tx3)' }}>
            {jiraResult.missingInJira.length} {t('js.tileOnlyPlanr')}
          </span>
        </>
      )}
    </div>
  );
}

function JiraReconcileLists({ jiraResult, onOpenItem }) {
  const { t } = useT();
  return (
    <>
      {/* Titles differ — reported only, never auto-applied (a rename is a
            judgment call, not a status). */}
      <JiraSection
        title={t('js.summaryDrift')}
        tone="var(--tx2)"
        count={jiraResult?.summaryDrift.length || 0}
        hint={t('js.summaryDriftHint')}
      >
        {(jiraResult?.summaryDrift || []).slice(0, JIRA_MAX_ROWS).map(row => (
          <JiraRow
            key={row.id}
            id={row.id}
            name={row.name}
            onClick={() => onOpenItem?.(row.id)}
            right={
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--tx3)',
                  maxWidth: 200,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {t('js.inJira')}: {row.jiraSummary}
              </span>
            }
          />
        ))}
      </JiraSection>
      <JiraSection title={t('js.onlyJira')} tone="var(--ac)" count={jiraResult?.missingInPlanr.length || 0} hint={t('js.onlyJiraHint')}>
        {(jiraResult?.missingInPlanr || []).slice(0, JIRA_MAX_ROWS).map(row => (
          <JiraRow
            key={row.key}
            id={row.key}
            name={row.summary || '—'}
            right={
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                {row.knownPlanrId && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--am)' }}>{t('js.linkTo', row.knownPlanrId)}</span>
                )}
                {row.mapped && (
                  <span style={{ fontSize: 10, color: 'var(--tx3)' }}>
                    {S_DOT[row.mapped]} {row.status}
                  </span>
                )}
              </span>
            }
          />
        ))}
      </JiraSection>
      <JiraSection title={t('js.onlyPlanr')} tone="var(--ac)" count={jiraResult?.missingInJira.length || 0} hint={t('js.onlyPlanrHint')}>
        {(jiraResult?.missingInJira || []).slice(0, JIRA_MAX_ROWS).map(row => (
          <JiraRow
            key={row.id}
            id={row.id}
            name={row.name}
            onClick={() => onOpenItem?.(row.id)}
            right={
              <span style={{ fontSize: 10, color: 'var(--tx3)' }}>
                {S_DOT[row.status]} {row.key}
              </span>
            }
          />
        ))}
      </JiraSection>
    </>
  );
}

export function JiraDriftSection({
  jiraOpen,
  setJiraOpen,
  jiraFields,
  jiraFieldId,
  jiraHealth,
  jiraResult,
  jiraStatusDiff,
  jiraAccepted,
  toggleJiraRow,
  applyJiraDiffs,
  onOpenItem,
  jiraBoxRef,
  jiraText,
  setJiraText,
  jiraParsed,
}) {
  const { t } = useT();
  return (
    <>
      {/* ══════ Jira drift — the reconcile result as rows, not a dialog ══════ */}
      <div className="section-h" style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        {t('js.title')}
        <button
          className="btn btn-ghost btn-xs"
          style={{ padding: '1px 6px', fontSize: 11, marginLeft: 'auto' }}
          onClick={() => setJiraOpen(o => !o)}
        >
          <Icon name={jiraOpen ? 'chevronDown' : 'chevronRight'} size={11} /> {jiraOpen ? t('js.tabCompare') : t('js.pasteLabel')}
        </button>
      </div>
      <div style={{ marginBottom: 18 }}>
        <p className="helper" style={{ marginTop: -4, marginBottom: 8, fontSize: 12 }}>
          {jiraFieldId ? (
            t('js.fieldHint', jiraFields.find(f => f.id === jiraFieldId)?.name || jiraFieldId)
          ) : (
            <span style={{ color: 'var(--am)' }}>{t('js.noField')}</span>
          )}
        </p>

        <JiraHealthTiles jiraHealth={jiraHealth} jiraResult={jiraResult} jiraStatusDiff={jiraStatusDiff} />

        {/* Link health — answerable from the plan alone, no paste needed
            (same two checks the old "Link check" tab ran). */}
        <JiraSection title={t('js.dupes')} tone="var(--re)" count={jiraHealth.duplicates.length} hint={t('js.dupesHint')}>
          {jiraHealth.duplicates.map(dupe => (
            <JiraRow
              key={dupe.key}
              id={dupe.key}
              name={dupe.ids.join(' · ')}
              onClick={() => onOpenItem?.(dupe.ids[0])}
              testId={`bv-jira-dupe-${dupe.key}`}
            />
          ))}
        </JiraSection>
        <JiraSection title={t('js.unlinkedOpen')} tone="var(--am)" count={jiraHealth.unlinkedOpen.length} hint={t('js.unlinkedHint')}>
          {jiraHealth.unlinkedOpen.slice(0, JIRA_MAX_ROWS).map(row => (
            <JiraRow key={row.id} id={row.id} name={row.name} onClick={() => onOpenItem?.(row.id)} testId={`bv-jira-unlinked-${row.id}`} />
          ))}
          {jiraHealth.unlinkedOpen.length > JIRA_MAX_ROWS && (
            <div style={{ fontSize: 10, color: 'var(--tx3)', textAlign: 'center', paddingTop: 2 }}>
              {t('js.more', jiraHealth.unlinkedOpen.length - JIRA_MAX_ROWS)}
            </div>
          )}
        </JiraSection>

        <JiraStatusDiff
          jiraStatusDiff={jiraStatusDiff}
          jiraAccepted={jiraAccepted}
          toggleJiraRow={toggleJiraRow}
          applyJiraDiffs={applyJiraDiffs}
          onOpenItem={onOpenItem}
        />

        <JiraReconcileLists jiraResult={jiraResult} onOpenItem={onOpenItem} />

        {jiraOpen && <JiraPasteBox jiraBoxRef={jiraBoxRef} jiraText={jiraText} setJiraText={setJiraText} jiraParsed={jiraParsed} />}

        {jiraResult
          ? !jiraStatusDiff.length &&
            !jiraResult.summaryDrift.length &&
            !jiraResult.missingInPlanr.length &&
            !jiraResult.missingInJira.length && <div style={{ fontSize: 12, color: 'var(--tx3)' }}>{t('js.inSync')}</div>
          : !jiraHealth.unlinkedOpen.length &&
            !jiraHealth.duplicates.length && <div style={{ fontSize: 12, color: 'var(--tx3)' }}>{t('js.allClean')}</div>}
      </div>
    </>
  );
}
