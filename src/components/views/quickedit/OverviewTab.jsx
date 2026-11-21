import { Icon } from '../../shared/Icon.jsx';
import { SearchSelect } from '../../shared/SearchSelect.jsx';
import { AutoAssignHint } from '../../shared/AutoAssignHint.jsx';
import { CustomFieldInput } from '../../shared/CustomFieldInput.jsx';
import { useT } from '../../../i18n.jsx';
import { teamForAssignment } from '../../../utils/memberTeams.js';
import { RootFields } from './RootFields.jsx';

export function OverviewTab({
  bufferNode,
  customFields,
  f,
  flushNode,
  focusRefs,
  isLeaf,
  isRoot,
  memberLabel,
  memberName,
  members,
  patchNode,
  scheduled,
  teams,
}) {
  const { t } = useT();
  return (
    <>
      <div className="field">
        <label>{t('qe.name')}</label>
        <input ref={focusRefs.name} value={f.name || ''} onChange={e => bufferNode({ name: e.target.value })} onBlur={flushNode} />
      </div>
      {/* Team and assignee are attributes of the item, like its name, so they
          sit on Overview — the same place NodeModal keeps them, which is where
          the Insights "People" section jumps to in both editors. */}
      <div className="field">
        <label>{t('qe.team')}</label>
        <SearchSelect
          value={f.team || ''}
          options={teams.map(team => ({ id: team.id, label: team.name || team.id }))}
          onSelect={value => patchNode({ team: value })}
          allowEmpty
        />
        {/* Team-lock pill — bordered chip next to the team picker, no
            orphan slider. Same styling as the NodeModal counterpart. */}
        {isLeaf && f.team && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 6,
              padding: '2px 8px',
              borderRadius: 4,
              border: `1px solid ${f.teamLock ? 'var(--am)' : 'var(--b)'}`,
              background: f.teamLock ? 'rgba(245,158,11,.08)' : 'transparent',
              fontSize: 12,
              color: 'var(--tx2)',
            }}
            data-htip={t('qe.teamLockTip')}
          >
            <span>{t('qe.teamLock')}</span>
            <label className="toggle" style={{ margin: 0 }}>
              <input type="checkbox" checked={!!f.teamLock} onChange={e => patchNode({ teamLock: e.target.checked })} />
              <span className="slider" />
            </label>
          </div>
        )}
        {isLeaf && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 6,
              marginLeft: 6,
              padding: '2px 8px',
              borderRadius: 4,
              border: `1px solid ${f.parallel ? 'var(--ac)' : 'var(--b)'}`,
              background: f.parallel ? 'rgba(59,130,246,.08)' : 'transparent',
              fontSize: 12,
              color: 'var(--tx2)',
            }}
            data-htip={t('qe.parallelTip')}
          >
            <span>{t('qe.parallel') || 'Parallel'}</span>
            <label className="toggle" style={{ margin: 0 }}>
              <input type="checkbox" checked={!!f.parallel} onChange={e => patchNode({ parallel: e.target.checked || undefined })} />
              <span className="slider" />
            </label>
          </div>
        )}
      </div>

      <div className="field">
        <label>{t('qe.assignee')}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: (f.assign || []).length ? 6 : 0 }}>
          {(f.assign || []).map(id => (
            <span key={id} className="tag">
              {memberName(id)}
              <span className="tag-x" onClick={() => patchNode({ assign: (f.assign || []).filter(entry => entry !== id) })}>
                <Icon name="x" size={9} />
              </span>
            </span>
          ))}
        </div>
        {isLeaf && (
          <AutoAssignHint node={f} scheduled={scheduled} members={members} onAccept={({ assign, team }) => patchNode({ assign, team })} />
        )}
        <div ref={focusRefs.assign}>
          <SearchSelect
            options={members
              .filter(member => !(f.assign || []).includes(member.id))
              .map(member => ({ id: member.id, label: memberLabel(member) }))}
            onSelect={id => {
              const member = members.find(entry => entry.id === id);
              patchNode({ assign: [...new Set([...(f.assign || []), id])], team: teamForAssignment(member, f.team) });
            }}
            placeholder={t('qe.assignPerson')}
          />
        </div>
      </div>

      <div className="field">
        <label>{t('qe.priority')}</label>
        <SearchSelect
          value={String(f.prio || 2)}
          options={[
            { id: '1', label: `1 ${t('critical')}` },
            { id: '2', label: `2 ${t('high')}` },
            { id: '3', label: `3 ${t('medium')}` },
            { id: '4', label: `4 ${t('low')}` },
          ]}
          onSelect={value => patchNode({ prio: +value })}
        />
      </div>
      <div className="field">
        <label>{t('qe.notes')}</label>
        <textarea value={f.note || ''} onChange={e => bufferNode({ note: e.target.value })} onBlur={flushNode} rows={2} />
      </div>

      {isRoot && <RootFields f={f} bufferNode={bufferNode} flushNode={flushNode} patchNode={patchNode} />}

      {/* ── Custom fields ── */}
      {customFields.length > 0 && (
        <div ref={focusRefs.customFields} style={{ marginTop: 4 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--tx3)',
              textTransform: 'uppercase',
              letterSpacing: '.07em',
              marginBottom: 6,
            }}
          >
            {t('cf.fieldValues')}
          </div>
          {customFields.map(cf => (
            <div key={cf.id} className="field">
              <label>{cf.name}</label>
              <CustomFieldInput
                field={cf}
                value={(f.customValues || {})[cf.id] ?? ''}
                onChange={val => patchNode({ customValues: { ...(f.customValues || {}), [cf.id]: val } })}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
