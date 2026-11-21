import { useT } from '../../../i18n.jsx';
import { Icon } from '../../shared/Icon.jsx';
import { useEffective, useDayFormat } from '../../shared/Effective.jsx';

export { DatedHint };

// Says, inside a dialog, that what is edited here takes effect on a date —
// and which fields that covers. Nothing while the day is today.
function DatedHint() {
  const { t } = useT();
  const fmt = useDayFormat();
  const { date } = useEffective();
  if (!date) return null;
  return (
    <div className="eff-dialog-hint" data-testid="dated-hint">
      <Icon name="calendar" size={13} />
      {t('eff.dialogHint', fmt(date))}
    </div>
  );
}
