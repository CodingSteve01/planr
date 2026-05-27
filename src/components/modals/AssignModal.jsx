import { useState } from 'react';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { useDialogShortcuts } from '../../utils/useDialogShortcuts.js';
import { useT } from '../../i18n.jsx';

// Bulk assignment dialog: pick team and/or person, optionally clear either.
// Applied to whatever the caller decides — Gantt and Tree both open this
// from their selection action bar.
export function AssignModal({ count, teams = [], members = [], onApply, onClose }) {
  const { t } = useT();
  const [team, setTeam] = useState(null);          // null = leave unchanged
  const [teamClear, setTeamClear] = useState(false);
  const [person, setPerson] = useState(null);      // null = leave unchanged
  const [personClear, setPersonClear] = useState(false);

  const canApply = teamClear || personClear || team !== null || person !== null;
  const apply = () => {
    if (!canApply) return;
    onApply({
      team: teamClear ? '' : team,
      person: personClear ? '' : person,
    });
    onClose();
  };
  useDialogShortcuts(onClose, apply);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>{t('assign.title') || 'Zuweisung'}</span>
          <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{t('assign.scope', count) || `${count} Tasks ausgewählt`}</span>
        </div>

        <div className="field" style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{t('assign.team') || 'Team'}</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--tx3)', cursor: 'pointer' }}>
              <input type="checkbox" checked={teamClear} onChange={e => { setTeamClear(e.target.checked); if (e.target.checked) setTeam(null); }} />
              <span>{t('assign.clearTeam') || 'Team entfernen'}</span>
            </label>
          </label>
          <div style={{ opacity: teamClear ? 0.4 : 1, pointerEvents: teamClear ? 'none' : 'auto' }}>
            <SearchSelect
              value={team || ''}
              options={teams.map(tm => ({ id: tm.id, label: tm.name || tm.id }))}
              onSelect={v => { setTeam(v); setTeamClear(false); }}
              placeholder={t('assign.teamPlaceholder') || 'Team wählen…'}
            />
          </div>
        </div>

        <div className="field" style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{t('assign.person') || 'Person'}</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--tx3)', cursor: 'pointer' }}>
              <input type="checkbox" checked={personClear} onChange={e => { setPersonClear(e.target.checked); if (e.target.checked) setPerson(null); }} />
              <span>{t('assign.clearPerson') || 'Person entfernen'}</span>
            </label>
          </label>
          <div style={{ opacity: personClear ? 0.4 : 1, pointerEvents: personClear ? 'none' : 'auto' }}>
            <SearchSelect
              value={person || ''}
              options={members.map(m => ({ id: m.id, label: m.name || m.id }))}
              onSelect={v => { setPerson(v); setPersonClear(false); }}
              placeholder={t('assign.personPlaceholder') || 'Person wählen…'}
            />
          </div>
        </div>

        <div className="helper" style={{ marginTop: -4, marginBottom: 12 }}>
          {t('assign.hint') || 'Leere Felder bleiben unverändert. Aktiviere den Haken, um Team oder Person aus allen ausgewählten Tasks zu entfernen.'}
        </div>

        <div className="modal-footer">
          <button className="btn btn-sec" onClick={onClose}>{t('assign.cancel') || 'Abbrechen'}</button>
          <button className="btn btn-pri" disabled={!canApply} onClick={apply}>{t('assign.apply') || 'Zuweisen'}</button>
        </div>
      </div>
    </div>
  );
}
