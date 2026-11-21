import { Icon } from '../../shared/Icon.jsx';
import { GT_ICON } from '../../../constants.js';
import { SearchSelect } from '../../shared/SearchSelect.jsx';
import { AutoAssignHint } from '../../shared/AutoAssignHint.jsx';
import { CustomFieldInput } from '../../shared/CustomFieldInput.jsx';
import { teamForAssignment } from '../../../utils/memberTeams.js';

export function OverviewTab({
  t,
  f,
  s,
  setF,
  node,
  tree,
  teams,
  members,
  scheduled,
  isDirty,
  isLeaf,
  isRoot,
  focusRefs,
  currentParentId,
  parentOptions,
  memberLabel,
  customFields,
  setCustomValue,
  onMove,
}) {
  return (
    <>
      <div className="field">
        <label>{t('qe.name')}</label>
        <input ref={focusRefs.name} value={f.name || ''} onChange={e => s('name', e.target.value)} autoFocus />
      </div>
      {/* Who this belongs to. It used to sit on the Status tab, which had
            become a catch-all: status, progress, dropping, phases, team,
            assignment and the schedule's suggestion, all under a label that
            named exactly one of them. Team and assignee are attributes of the
            ITEM, like its name and its notes, so they live with them — and
            what is left on Status is the question its name asks. */}
      <div className="field">
        <label>{t('qe.team')}</label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ flex: '0 0 180px' }}>
            <SearchSelect
              value={f.team || ''}
              options={teams.map(tm => ({ id: tm.id, label: tm.name || tm.id }))}
              onSelect={v => s('team', v)}
              allowEmpty
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            {(f.assign || []).map(a => {
              const m = members.find(x => x.id === a);
              return (
                <span key={a} className="tag">
                  {m?.name || a}
                  <span
                    className="tag-x"
                    onClick={() =>
                      s(
                        'assign',
                        (f.assign || []).filter(x => x !== a),
                      )
                    }
                  >
                    <Icon name="x" size={9} />
                  </span>
                </span>
              );
            })}
            <div ref={focusRefs.assign} style={{ minWidth: 160, flex: 1 }}>
              <SearchSelect
                options={members.filter(m => !(f.assign || []).includes(m.id)).map(m => ({ id: m.id, label: memberLabel(m) }))}
                onSelect={id => {
                  const m = members.find(x => x.id === id);
                  setF(x => ({ ...x, assign: [...new Set([...(x.assign || []), id])], team: teamForAssignment(m, x.team) }));
                }}
                placeholder={t('qe.assignPerson')}
              />
            </div>
          </div>
          {/* Team-lock toggle sits inline on the right edge of the team
                row so it lives in the same baseline as the picker — keeps
                the layout aligned instead of stacking a stray slider below. */}
          {isLeaf && f.team && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginLeft: 8,
                padding: '2px 8px',
                borderRadius: 4,
                border: `1px solid ${f.teamLock ? 'var(--am)' : 'var(--b)'}`,
                background: f.teamLock ? 'rgba(245,158,11,.08)' : 'transparent',
                fontSize: 12,
                color: 'var(--tx2)',
                whiteSpace: 'nowrap',
              }}
              data-htip={t('qe.teamLockTip')}
            >
              <span>{t('qe.teamLock')}</span>
              <label className="toggle" style={{ margin: 0 }}>
                <input type="checkbox" checked={!!f.teamLock} onChange={e => s('teamLock', e.target.checked)} />
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
                marginLeft: 8,
                padding: '2px 8px',
                borderRadius: 4,
                border: `1px solid ${f.parallel ? 'var(--ac)' : 'var(--b)'}`,
                background: f.parallel ? 'rgba(59,130,246,.08)' : 'transparent',
                fontSize: 12,
                color: 'var(--tx2)',
                whiteSpace: 'nowrap',
              }}
              data-htip={t('qe.parallelTip')}
            >
              <span>{t('qe.parallel') || 'Parallel'}</span>
              <label className="toggle" style={{ margin: 0 }}>
                <input type="checkbox" checked={!!f.parallel} onChange={e => s('parallel', e.target.checked || undefined)} />
                <span className="slider" />
              </label>
            </div>
          )}
        </div>
      </div>
      {isLeaf && (
        <AutoAssignHint
          node={f}
          scheduled={scheduled}
          members={members}
          onAccept={({ assign, team }) => setF(x => ({ ...x, assign, team }))}
        />
      )}
      <div className="field" style={{ maxWidth: 220 }}>
        <label>{t('qe.priority')}</label>
        <SearchSelect
          value={String(f.prio || 2)}
          options={[
            { id: '1', label: `▲▲ 1 ${t('critical')}` },
            { id: '2', label: `▲ 2 ${t('high')}` },
            { id: '3', label: `▬ 3 ${t('medium')}` },
            { id: '4', label: `▼ 4 ${t('low')}` },
          ]}
          onSelect={v => s('prio', +v)}
        />
      </div>
      <div className="field">
        <label>{t('qe.notes')}</label>
        <textarea value={f.note || ''} onChange={e => s('note', e.target.value)} rows={2} />
      </div>
      {isRoot && (
        <>
          <div className="frow">
            <div className="field">
              <label>{t('nm.focusType')}</label>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {['', 'goal', 'painpoint', 'deadline'].map(ft => (
                  <button key={ft} className={`goal-type-btn${(f.type || '') === ft ? ' active' : ''}`} onClick={() => s('type', ft)}>
                    {ft ? (
                      <>
                        <Icon name={GT_ICON[ft]} size={12} />
                        {t(ft)}
                      </>
                    ) : (
                      t('none')
                    )}
                  </button>
                ))}
              </div>
            </div>
            {f.type && (
              <div className="field" style={{ flex: '0 0 110px' }}>
                <label>{t('nm.severity')}</label>
                <SearchSelect
                  value={f.severity || 'high'}
                  options={[
                    { id: 'critical', label: t('critical') },
                    { id: 'high', label: t('high') },
                    { id: 'medium', label: t('medium') },
                  ]}
                  onSelect={v => s('severity', v)}
                />
              </div>
            )}
            {f.type === 'deadline' && (
              <div className="field" style={{ flex: '0 0 140px' }}>
                <label>{t('qe.date')}</label>
                <input type="date" value={f.date || ''} onChange={e => s('date', e.target.value)} />
              </div>
            )}
          </div>
          {f.type && (
            <div className="field">
              <label>{t('qe.description')}</label>
              <input value={f.description || ''} onChange={e => s('description', e.target.value)} placeholder={t('qe.descPlaceholder')} />
            </div>
          )}
        </>
      )}

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
          <div className="frow" style={{ flexWrap: 'wrap' }}>
            {customFields.map(cf => (
              <div key={cf.id} className="field" style={{ flex: '1 1 200px' }}>
                <label>{cf.name}</label>
                <CustomFieldInput field={cf} value={(f.customValues || {})[cf.id] ?? ''} onChange={val => setCustomValue(cf.id, val)} />
              </div>
            ))}
          </div>
        </div>
      )}
      {onMove && (
        <div className="field">
          <label>{t('nm.parent')}</label>
          <SearchSelect
            value={currentParentId}
            options={parentOptions}
            onSelect={newPid => {
              if (newPid === currentParentId) return;
              if (isDirty) {
                alert(t('nm.saveFirst'));
                return;
              }
              const sub = tree.filter(r => r.id === node.id || r.id.startsWith(node.id + '.')).length;
              if (!confirm(t('nm.confirmMove', node.name, sub - 1, newPid || t('nm.topLevel')))) return;
              onMove(node.id, newPid);
            }}
            placeholder={t('nm.topLevel')}
            showIds
          />
        </div>
      )}
    </>
  );
}
