import { useState } from 'react';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { useDialogShortcuts } from '../../utils/useDialogShortcuts.js';
import { useT } from '../../i18n.jsx';

// Bulk assignment dialog: pick team and one or more persons, optionally
// clear either. Applied to whatever the caller decides — Gantt and Tree
// both open this from their selection action bar.
export function AssignModal({ count, teams = [], members = [], onApply, onClose }) {
  const { t } = useT();
  const [team, setTeam] = useState(null);          // null = leave unchanged
  const [teamClear, setTeamClear] = useState(false);
  const [persons, setPersons] = useState(null);    // null = leave unchanged, [] = clear, [id,...] = set
  const [personsClear, setPersonsClear] = useState(false);

  const memberById = Object.fromEntries((members || []).map(m => [m.id, m]));
  const pickedPersons = personsClear ? [] : (persons || []);
  const addPerson = (id) => {
    if (!id) return;
    setPersons(prev => {
      const list = prev || [];
      if (list.includes(id)) return list;
      return [...list, id];
    });
    setPersonsClear(false);
  };
  const removePerson = (id) => {
    setPersons(prev => (prev || []).filter(x => x !== id));
  };

  const canApply = teamClear || personsClear
    || team !== null
    || (persons !== null && persons.length > 0);
  const apply = () => {
    if (!canApply) return;
    onApply({
      team: teamClear ? '' : team,
      persons: personsClear ? [] : persons,
    });
    onClose();
  };
  useDialogShortcuts(onClose, apply);

  const remainingMembers = (members || []).filter(m => !pickedPersons.includes(m.id));

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 520 }}>
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
            <span>{t('assign.persons') || t('assign.person') || 'Personen'}</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--tx3)', cursor: 'pointer' }}>
              <input type="checkbox" checked={personsClear} onChange={e => { setPersonsClear(e.target.checked); if (e.target.checked) setPersons(null); }} />
              <span>{t('assign.clearPersons') || t('assign.clearPerson') || 'Alle entfernen'}</span>
            </label>
          </label>
          <div style={{ opacity: personsClear ? 0.4 : 1, pointerEvents: personsClear ? 'none' : 'auto' }}>
            {/* Chip list of picked persons. Click x to remove. */}
            {pickedPersons.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {pickedPersons.map(id => {
                  const m = memberById[id];
                  return (
                    <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 4px 3px 8px', background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 14, fontSize: 11 }}>
                      <span>{m?.name || id}</span>
                      <button type="button" onClick={() => removePerson(id)} aria-label="Remove"
                        style={{ width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--tx3)', cursor: 'pointer', fontSize: 13, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                    </span>
                  );
                })}
              </div>
            )}
            <SearchSelect
              value=""
              options={remainingMembers.map(m => ({ id: m.id, label: m.name || m.id }))}
              onSelect={addPerson}
              placeholder={t('assign.personPlaceholder') || 'Person hinzufügen…'}
            />
          </div>
        </div>

        <div className="helper" style={{ marginTop: -4, marginBottom: 12 }}>
          {t('assign.hint') || 'Leere Felder bleiben unverändert. Aktiviere den Haken, um Team oder Personen aus allen ausgewählten Tasks zu entfernen. Mehrere Personen = Multi-Assign (alle gleichzeitig).'}
        </div>

        <div className="modal-footer">
          <button className="btn btn-sec" onClick={onClose}>{t('assign.cancel') || 'Abbrechen'}</button>
          <button className="btn btn-pri" disabled={!canApply} onClick={apply}>{t('assign.apply') || 'Zuweisen'}</button>
        </div>
      </div>
    </div>
  );
}
