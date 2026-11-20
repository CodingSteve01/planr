import { PL, SL } from '../../constants.js';
import { pt } from '../../utils/scheduler.js';

export const SBadge = ({ s }) => <span className={`badge b${s[0]}`}>{SL[s] || s}</span>;
export const PBadge = ({ p }) => <span className={`badge bp${p}`}>{PL[p] || `P${p}`}</span>;

export function TBadge({ t, teams }) {
  const team = teams?.find(x => x.id === pt(t));
  if (!team) return <span className="badge bo">{t || '—'}</span>;
  return <span className="badge" style={{ background: team.color + '22', color: team.color, border: `1px solid ${team.color}44` }}>{team.name || t}</span>;
}
