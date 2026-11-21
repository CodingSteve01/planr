import { useMemo } from 'react';
import { useT } from '../../../i18n.jsx';
import { formatShift } from '../../../utils/scenarioUi/format.js';

function useFmt() {
  const { t, lang } = useT();
  return useMemo(() => {
    const locale = lang === 'de' ? 'de-DE' : 'en-GB';
    const date = d => {
      if (!d) return '—';
      // A bare ISO day is a local day; `new Date('2026-03-01')` would be UTC.
      const m = typeof d === 'string' ? d.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
      const value = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(d);
      return Number.isNaN(+value) ? String(d) : value.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
    };
    const shift = n => formatShift(t, n);
    const pt = n => `${Math.round(n * 10) / 10} ${t('pt')}`;
    return { date, shift, pt };
  }, [t, lang]);
}
export { useFmt };
