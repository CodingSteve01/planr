import { useT } from '../../../i18n.jsx';
import { PRESENCE_LABEL, latenessOf } from '../../../utils/scenarioUi/compareFigures.js';

const LATE_BADGE = { nowLate: 'risk', nowOnTime: 'good', stillLate: 'muted' };

// The badges a row of the comparison carries, as one set the panels share.
export function useCompareBadges() {
  const { t } = useT();
  const stateBadge = p => {
    const late = latenessOf(p);
    if (!late) return null;
    return <span className={`scn-badge ${LATE_BADGE[late]}`}>{t(`scn.${late}`)}</span>;
  };
  const presence = p => {
    const label = PRESENCE_LABEL[p.presence];
    return label ? <span className={`scn-badge ${label.badge}`}>{t(label.key)}</span> : null;
  };
  const empty = msg => <div className="scn-empty">{msg}</div>;
  return { stateBadge, presence, empty };
}
