import { useState } from 'react';
import { useT } from '../../i18n.jsx';
import { iso } from '../../utils/date.js';
import { Icon } from '../shared/Icon.jsx';

// "Changes count as of …".
//
// The history log could already move one event to another day, one at a time,
// in the item's own dialog. Restructuring a package is twenty events, so that
// was a way of describing the problem rather than a way out of it.
//
// What this sets is a claim about when the edits COUNT, not when they were
// made: the timestamp on every event stays honest, and the effective date is
// what the review window reads (utils/historyView.js, `effectiveDateOfEvent`).
// So a package split today, dated to last Monday, is already in the past by
// the time this week's review opens — which is the truth, because the work it
// describes was there all along.
export function BackdateModal({ value, onApply, onClose }) {
  const { t } = useT();
  const [date, setDate] = useState(value || iso(new Date()));

  const apply = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    onApply(date);
  };

  return <div className="overlay" onClick={onClose}>
    <div className="modal fade" data-testid="backdate-dialog" style={{ width: 'min(460px, 100%)' }} onClick={e => e.stopPropagation()}>
      <div className="modal-head">
        <span>{t('bd.title')}</span>
        <button className="btn btn-ghost btn-icon sm" onClick={onClose} aria-label={t('cancel')}><Icon name="x" size={11} /></button>
      </div>
      <div style={{ padding: 16 }}>
        <p className="helper" style={{ marginTop: 0, marginBottom: 14, fontSize: 12 }}>{t('bd.help')}</p>
        <div className="field">
          <label>{t('bd.date')}</label>
          <input
            type="date"
            value={date}
            autoFocus
            onChange={e => setDate(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }}
            style={{ fontFamily: 'var(--mono)' }}
          />
        </div>
        <p className="helper" style={{ marginBottom: 0, fontSize: 11 }}>{t('bd.reset')}</p>
      </div>
      <div className="modal-footer">
        <button className="btn btn-sec" onClick={onClose}>{t('cancel')}</button>
        <button className="btn btn-pri" data-testid="backdate-apply" onClick={apply}>{t('bd.apply')}</button>
      </div>
    </div>
  </div>;
}
