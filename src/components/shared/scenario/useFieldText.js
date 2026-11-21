import { useMemo } from 'react';
import { useT } from '../../../i18n.jsx';
import { DATE_FIELDS, FIELD_LABELS, OPAQUE, PRIO_KEYS } from '../../../utils/scenarioUi/fieldLabels.js';

function useFieldText(base, work, fmt) {
  const { t } = useT();
  return useMemo(() => {
    const members = new Map([...(base?.members || []), ...(work?.members || [])].map(m => [m.id, m.name || m.id]));
    const teams = new Map([...(base?.teams || []), ...(work?.teams || [])].map(tm => [tm.id, tm.name || tm.id]));
    const items = new Map([...(base?.tree || []), ...(work?.tree || [])].map(n => [n.id, n.name || '']));
    const none = '—';
    const value = (key, v) => {
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) return none;
      if (key === 'assign') return v.map(id => members.get(id) || id).join(', ');
      if (key === 'team') return teams.get(v) || v;
      if (key === 'teams') return v.map(id => teams.get(id) || id).join(', ');
      if (key === 'deps' || key === 'softDeps') return v.map(id => (items.get(id) ? `${id} ${items.get(id)}` : id)).join(', ');
      if (key === 'status' || key === 'severity' || key === 'type') return t(v);
      if (key === 'prio') return PRIO_KEYS[v] ? t(PRIO_KEYS[v]) : String(v);
      if (key === 'confidence') return t(`conf.${v}`);
      if (key === 'capMode') return t(v === 'derived' ? 'scn.capDerived' : 'scn.capManual');
      if (DATE_FIELDS.has(key)) return fmt.date(v);
      if (key === 'best' || key === 'fixedDays') return `${v} ${t('pt')}`;
      if (key === 'factor') return `×${v}`;
      if (key === 'progress') return `${v} %`;
      if (key === 'cap') return `${Math.round(v * 100)} %`;
      if (key === 'weeklyHours') return `${v} h`;
      if (key === 'dropped' || key === 'teamLock') return v ? t('yes') : t('no');
      if (Array.isArray(v)) return v.join(', ');
      if (typeof v === 'object') return '…';
      return String(v);
    };
    // Fields without a name the user would recognise are counted, not shown:
    // a raw key in a list you are about to apply reads as a bug.
    const fields = list => {
      const known = list.filter(f => FIELD_LABELS[f.key]);
      const parts = known.map(f =>
        OPAQUE.has(f.key) ? t(FIELD_LABELS[f.key]) : `${t(FIELD_LABELS[f.key])}: ${value(f.key, f.from)} → ${value(f.key, f.to)}`,
      );
      const other = list.length - known.length;
      if (other) parts.push(other === 1 ? t('scn.otherField') : t('scn.otherFields', other));
      return parts.join(' · ');
    };
    const person = id => members.get(id) || id;
    const owner = key => (key.startsWith('team:') ? teams.get(key.slice(5)) || key.slice(5) : members.get(key) || key);
    return { fields, person, owner };
  }, [base, work, t, fmt]);
}
export { useFieldText };
