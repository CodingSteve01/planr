import { useT } from '../../../i18n.jsx';

// The badges a row of the comparison carries, as one set the panels share.
export function useCompareBadges() {
  const { t } = useT();
  const stateBadge = p => {
    if (p.workLate && !p.baseLate) return <span className="scn-badge risk">{t('scn.nowLate')}</span>;
    if (p.baseLate && !p.workLate && p.presence === 'both') return <span className="scn-badge good">{t('scn.nowOnTime')}</span>;
    if (p.workLate) return <span className="scn-badge muted">{t('scn.stillLate')}</span>;
    return null;
  };
  const presence = p =>
    p.presence === 'added' ? (
      <span className="scn-badge new">{t('scn.added')}</span>
    ) : p.presence === 'removed' ? (
      <span className="scn-badge muted">{t('scn.removed')}</span>
    ) : p.presence === 'dropped' ? (
      <span className="scn-badge muted">{t('scn.droppedBadge')}</span>
    ) : p.presence === 'unscheduled' ? (
      <span className="scn-badge muted">{t('scn.unscheduled')}</span>
    ) : p.presence === 'scheduled' ? (
      <span className="scn-badge new">{t('scn.newlyScheduled')}</span>
    ) : null;
  const empty = msg => <div className="scn-empty">{msg}</div>;
  return { stateBadge, presence, empty };
}
