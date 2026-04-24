import { useMemo } from 'react';
import { isoWeek } from '../../utils/date.js';
import { computeRoadmapModel } from '../../utils/roadmap.js';
import { useT } from '../../i18n.jsx';

// "Zugfahrplan" — compact chronological station timetable for each subway line.
// Single-line rows, no table header: station-abbrev · date-range · dur · team · status.
// Station full name + all cluster items shown in hover tooltip.
export function TimetableView({ tree, scheduled, stats, teams, members }) {
  useT();
  const model = useMemo(() => computeRoadmapModel({ tree, scheduled, stats }), [tree, scheduled, stats]);

  const teamById = useMemo(() => Object.fromEntries((teams || []).map(tm => [tm.id, tm])), [teams]);
  const memberById = useMemo(() => Object.fromEntries((members || []).map(m => [m.id, m])), [members]);
  const treeById = useMemo(() => Object.fromEntries((tree || []).map(r => [r.id, r])), [tree]);

  // All scheduled segments (handoff chains produce id `${orig}#N` with treeId=orig).
  const segmentsByTree = useMemo(() => {
    const m = {};
    for (const s of scheduled || []) {
      const key = s.treeId || s.id;
      (m[key] ||= []).push(s);
    }
    return m;
  }, [scheduled]);

  const today = new Date();

  if (!model?.lines?.length) {
    return (
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 20px', textAlign: 'center', color: 'var(--tx3)' }}>
        <div style={{ fontSize: 14 }}>Kein Fahrplan verfügbar — benötigt eingeplante Projekt-Items.</div>
      </div>
    );
  }

  const shortDate = d => {
    if (!d) return '—';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${dd}.${mm}`;
  };

  const statusGlyph = status => {
    if (status === 'done') return { icon: '✓', color: 'var(--gr)' };
    if (status === 'wip') return { icon: '◐', color: 'var(--am)' };
    return { icon: '○', color: 'var(--tx3)' };
  };

  return (
    <div>
      <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginBottom: 8 }}>
        Chronologische Stationen je Linie · Hover für Details. Grün hinterlegt = aktuelle Position.
      </div>

      {model.lines.map((line, lineIdx) => {
        const color = line.color;
        const allStations = [...line.majorStations, ...line.minorStations]
          .filter(st => st.clusterItems && st.clusterItems.length);

        const rows = allStations.map(st => {
          const items = st.clusterItems || [];
          // Resolve each cluster item → all its scheduled segments (+ tree fallback).
          const allSegs = items.flatMap(it => segmentsByTree[it.id] || []);
          const dated = allSegs.filter(s => s && s.startD && s.endD);
          const startD = dated.length ? new Date(Math.min(...dated.map(s => +s.startD))) : null;
          const endD = dated.length ? new Date(Math.max(...dated.map(s => +s.endD))) : null;

          // Teams: from segments (covers cross-team handoffs) + tree fallback.
          const teamIds = [...new Set([
            ...allSegs.map(s => s.team),
            ...items.map(it => treeById[it.id]?.team),
          ].filter(Boolean))];
          const teamLabel = teamIds.map(id => teamById[id]?.name || id).join(' · ') || '—';

          // Persons who work(ed) on this station's items.
          const personIds = [...new Set(allSegs.map(s => s.personId || (s.assign && s.assign[0])).filter(Boolean))];
          const personLabel = personIds.map(id => memberById[id]?.name || id).join(', ');

          const status = st.allDone
            ? 'done'
            : (dated.some(s => s.status === 'wip') || items.some(it => treeById[it.id]?.status === 'wip'))
              ? 'wip'
              : 'open';

          const workDays = dated.reduce((sum, s) => sum + (s.workingDaysInWindow || 0), 0);
          const totalCalDays = startD && endD ? Math.max(1, Math.round((endD - startD) / 86400000) + 1) : 0;
          const current = line.currentId === st.id && !st.allDone;

          // Rich tooltip: station name + per-item status/assignees.
          const tipLines = [st.name + (items.length > 1 ? ` (${items.length} Items)` : '')];
          items.forEach(it => {
            const tr = treeById[it.id];
            const segs = segmentsByTree[it.id] || [];
            const stStatus = tr?.status || (segs[0]?.status) || 'open';
            const glyph = stStatus === 'done' ? '✓' : stStatus === 'wip' ? '◐' : '○';
            const persons = [...new Set(segs.map(s => s.person || (s.assign && s.assign[0])).filter(Boolean))].join(', ');
            tipLines.push(`  ${glyph} ${it.name}${persons ? ` — ${persons}` : ''}`);
          });
          const tip = tipLines.join('\n');

          return { station: st, items, startD, endD, teamLabel, personLabel, status, workDays, totalCalDays, current, tip };
        }).sort((a, b) => (a.startD || 0) - (b.startD || 0));

        const trainRow = rows.find(r => r.current);

        return (
          <div key={lineIdx} style={{ marginBottom: 18 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
              paddingBottom: 3, borderBottom: `2px solid ${color}`,
            }}>
              <span style={{
                display: 'inline-block', minWidth: 30, height: 16, borderRadius: 3,
                background: color, color: '#fff', fontFamily: 'var(--mono)',
                fontWeight: 700, fontSize: 10, textAlign: 'center', lineHeight: '16px',
                padding: '0 4px',
              }}>{line.root.id}</span>
              <span style={{ fontWeight: 600, fontSize: 12 }}>{line.root.name}</span>
              {trainRow && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color, fontWeight: 600 }}>
                  → {trainRow.station.abbrev}
                </span>
              )}
              {!trainRow && line.progress >= 1 && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--gr)', fontWeight: 600 }}>
                  ✓ komplett
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {rows.map((r) => {
                const g = statusGlyph(r.status);
                const isPast = r.endD && r.endD < today;
                const rowBg = r.current ? 'rgba(34,197,94,.10)' : (isPast && r.status === 'done' ? 'transparent' : 'var(--bg2)');
                const rowOpacity = r.status === 'done' && !r.current ? 0.55 : 1;
                return (
                  <div
                    key={r.station.id}
                    data-htip={r.tip}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '52px 120px 70px 1fr 18px',
                      alignItems: 'center',
                      gap: 8,
                      padding: '3px 8px',
                      background: rowBg,
                      opacity: rowOpacity,
                      borderLeft: r.current ? `3px solid ${color}` : '3px solid transparent',
                      borderRadius: 3,
                      fontSize: 11,
                      minHeight: 22,
                    }}>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color, fontSize: 11 }}>
                      {r.station.abbrev}
                      {r.items.length > 1 && (
                        <span style={{ marginLeft: 3, fontSize: 9, color: 'var(--tx3)', fontWeight: 400 }}>×{r.items.length}</span>
                      )}
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx2)' }}>
                      {r.startD && r.endD
                        ? <>KW{isoWeek(r.startD)} · {shortDate(r.startD)}–{shortDate(r.endD)}</>
                        : '—'}
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', textAlign: 'right' }}>
                      {r.totalCalDays > 0 ? `${r.totalCalDays}d/${r.workDays.toFixed(0)}PT` : '—'}
                    </span>
                    <span style={{
                      fontSize: 10.5, color: 'var(--tx2)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {r.teamLabel}
                      {r.personLabel && (
                        <span style={{ color: 'var(--tx3)', marginLeft: 4 }}>· {r.personLabel}</span>
                      )}
                    </span>
                    <span style={{ color: g.color, fontWeight: 600, textAlign: 'center' }}>{g.icon}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
