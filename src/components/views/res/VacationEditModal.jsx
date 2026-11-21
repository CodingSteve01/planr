import { useState, useEffect, useRef } from 'react';
import { SearchSelect } from '../../shared/SearchSelect.jsx';
import { Icon } from '../../shared/Icon.jsx';

export { VacationEditModal };

/* ─── VacationEditModal ───────────────────────────────────────────────── */
// Buffers all edits locally and emits a SINGLE onUpd on close. Previously
// each per-field commit fired its own onVac → setData → scheduler useMemo
// recomputed synchronously and the file-save debounce reset, so a four-field
// edit ran the scheduler 4× and queued 4 saves. Now: every keystroke updates
// `draft` only; the parent never re-renders until the modal closes — at
// which point a single batched patch flips state once.
function VacationEditModal({ vacation, members, onUpd, onDel, onClose, t }) {
  const [draft, setDraft] = useState(() => ({ ...vacation }));
  const setField = (field, val) => setDraft(d => ({ ...d, [field]: val }));

  // Capture the latest draft + vacation for the keydown handler so the
  // Escape path flushes the buffer instead of dropping it on the floor.
  const flushRef = useRef(null);
  flushRef.current = () => {
    const changed = ['person', 'from', 'to', 'note'].some(k => (draft[k] ?? '') !== (vacation[k] ?? ''));
    if (changed) onUpd({ person: draft.person, from: draft.from, to: draft.to, note: draft.note });
    onClose();
  };
  const flushAndClose = () => flushRef.current();

  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') flushRef.current();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <div className="overlay" onClick={flushAndClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>{t('rv.editVacation')}</span>
          <button className="btn btn-ghost btn-xs" onClick={flushAndClose} title={t('rv.close')}>
            <Icon name="x" size={11} />
          </button>
        </div>
        <div className="field">
          <label>{t('rv.person')}</label>
          <SearchSelect
            value={draft.person}
            options={members.map(m => ({ id: m.id, label: m.name || m.id }))}
            onSelect={val => setField('person', val)}
            placeholder={t('rv.choosePerson')}
          />
        </div>
        <div className="frow">
          <div className="field">
            <label>{t('rv.vacFrom')}</label>
            <input type="date" value={draft.from || ''} onChange={e => setField('from', e.target.value)} />
          </div>
          <div className="field">
            <label>{t('rv.vacTo')}</label>
            <input type="date" value={draft.to || ''} onChange={e => setField('to', e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>{t('rv.note')}</label>
          <input type="text" value={draft.note || ''} onChange={e => setField('note', e.target.value)} />
        </div>
        <div className="modal-footer">
          <button className="btn btn-danger btn-xs" onClick={onDel}>
            {t('rv.remove')}
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-sec" onClick={flushAndClose}>
            {t('rv.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
