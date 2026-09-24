import { useMemo, useState } from 'react';
import { useT } from '../../i18n.jsx';
import { useDialogShortcuts } from '../../utils/useDialogShortcuts.js';
import { Icon } from '../shared/Icon.jsx';
import { parseJiraTable } from '../../utils/jiraSync.js';
import { buildTreeFromJira, membersForAssignees } from '../../utils/jiraImport.js';

// The first day, from the board that already exists.
//
// Export and reconcile both went the other way. This one asks the question a
// new user actually has — "the tickets are already in Jira, do I have to type
// them all again" — and answers it with a paste, no backend and no
// credentials. What comes across is what a plan needs and Jira knows: the
// hierarchy, the status, the priority, the estimate and the assignee. What
// does not is everything the plan is for — dependencies, capacity, dates.
//
// Everything is decided in the preview before anything is written, because an
// import is the one action nobody wants to discover after the fact.
export function JiraImportModal({ tree = [], members = [], jiraFieldId = 'jira', hasProject = false, onImport, onClose }) {
  const { t } = useT();
  useDialogShortcuts(onClose);

  const [text, setText] = useState('');
  const [group, setGroup] = useState(true);
  const [projectName, setProjectName] = useState('');
  const [createMembers, setCreateMembers] = useState(false);

  const parsed = useMemo(() => parseJiraTable(text), [text]);

  // Start numbering after whatever the plan already has, so an import never
  // lands on top of an existing project.
  const startAt = useMemo(() => {
    const nums = tree.filter(n => !n.id.includes('.') && /^P\d+$/.test(n.id)).map(n => parseInt(n.id.slice(1), 10) || 0);
    return (nums.length ? Math.max(...nums) : 0) + 1;
  }, [tree]);

  const built = useMemo(() => buildTreeFromJira({
    rows: parsed.rows,
    members,
    jiraFieldId,
    groupUnder: group ? (projectName.trim() || t('ji.title')) : '',
    startAt,
  }), [parsed.rows, members, jiraFieldId, group, projectName, startAt, t]);

  const proposed = useMemo(
    () => membersForAssignees(built.unmatchedAssignees, members),
    [built.unmatchedAssignees, members],
  );
  const unestimated = built.tree.filter(n => !n.best && !built.tree.some(c => c.id.startsWith(n.id + '.'))).length;
  const ready = built.tree.length > 0;

  const submit = () => {
    if (!ready) return;
    onImport({
      nodes: built.tree,
      newMembers: createMembers ? proposed : [],
      projectName: group ? (projectName.trim() || t('ji.title')) : '',
    });
  };

  return <div className="overlay" onClick={onClose}>
    <div className="modal modal-lg fade" onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>{t('ji.title')}</h2>
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-icon sm" aria-label={t('close')} onClick={onClose}><Icon name="x" size={13} /></button>
      </div>
      <p className="helper" style={{ marginBottom: 12 }}>{t('ji.lead')}</p>

      <div className="field">
        <label>{t('ji.pasteLabel')}</label>
        <textarea
          data-testid="jira-import-paste"
          value={text}
          onChange={e => setText(e.target.value)}
          rows={7}
          spellCheck={false}
          placeholder={t('js.pastePlaceholder')}
          style={{ fontFamily: 'var(--mono)', fontSize: 12, width: '100%' }} />
        <p className="helper" style={{ marginTop: 4 }}>
          {text.trim() && !ready
            ? t('ji.nothing')
            : t('ji.parsed', parsed.rows.length, parsed.skipped)}
        </p>
      </div>

      {ready && <>
        {/* Deliberately not a `.field`: that class makes its label a block of
            uppercase small caps and stretches any input inside it to the full
            width, which turns a checkbox into a bar. */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
            <input type="checkbox" data-testid="jira-import-group" checked={group} onChange={e => setGroup(e.target.checked)} />
            {t('ji.groupLabel')}
          </label>
          <p className="helper" style={{ margin: '2px 0 0 24px' }}>{t('ji.groupHint')}</p>
          {group && <div className="field" style={{ margin: '6px 0 0 24px' }}>
            <input
              data-testid="jira-import-name"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder={t('ji.projectName')} />
          </div>}
        </div>

        {proposed.length > 0 && <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
            <input type="checkbox" data-testid="jira-import-members" checked={createMembers} onChange={e => setCreateMembers(e.target.checked)} />
            {proposed.length === 1 ? t('ji.createMembers1') : t('ji.createMembers', proposed.length)}
          </label>
          <p className="helper" style={{ margin: '2px 0 0 24px' }}>
            {t('ji.unmatched', built.unmatchedAssignees.slice(0, 6).join(', '))}
            {!createMembers && ` — ${t('ji.createMembersOff')}`}
          </p>
        </div>}

        {/* The preview is the whole point: an import is the one action nobody
            wants to find out about afterwards. */}
        <div className="field">
          <label>{t('ji.preview')}</label>
          <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '8px 10px', maxHeight: 240, overflow: 'auto' }}>
            {built.tree.slice(0, 40).map(node => (
              <div key={node.id} data-testid={`jira-import-row-${node.id}`}
                style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, padding: '1px 0',
                  paddingLeft: (node.id.split('.').length - 1) * 14 }}>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)', width: 58, flexShrink: 0 }}>{node.id}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
                {node.customValues?.[jiraFieldId] && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>{node.customValues[jiraFieldId]}</span>}
                {node.status !== 'open' && <span style={{ fontSize: 10, color: node.status === 'done' ? 'var(--st-done)' : 'var(--st-wip)', flexShrink: 0 }}>{t(node.status)}</span>}
              </div>
            ))}
            {built.tree.length > 40 && <div style={{ fontSize: 11, color: 'var(--tx3)', textAlign: 'center', padding: 4 }}>
              {t('ji.previewMore', built.tree.length - 40)}
            </div>}
          </div>
          <p className="helper" style={{ marginTop: 4 }}>
            {hasProject ? t('ji.appendHint', built.rootCount) : t('ji.newPlanHint')}
            {unestimated > 0 && ` ${t('ji.noEstimates', unestimated)}`}
          </p>
        </div>
      </>}

      <div className="modal-footer">
        <button className="btn btn-sec" onClick={onClose}>{t('cancel')}</button>
        <button className="btn btn-pri" data-testid="jira-import-submit" disabled={!ready} onClick={submit}>
          {t('ji.submit', built.tree.length)}
        </button>
      </div>
    </div>
  </div>;
}
