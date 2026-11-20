import { useMemo } from 'react';
import { iso, isoWeek, isoWeekYear } from '../../utils/date.js';
import { horizonLabel } from '../../utils/horizon.js';
import { computeRoadmapModel } from '../../utils/roadmap.js';
import { useT } from '../../i18n.jsx';
import { formatShift } from '../shared/Scenario.jsx';

// "Zugfahrplan" — compact chronological station timetable per subway line.
// 2-col line grid. Single-line rows: abbrev · KW/YY+date · dur · status.
// Team resolved via scheduled segments + tree fallback; shown in tooltip only.
export function TimetableView({
  tree,
  scheduled,
  stats,
  teams,
  members,
  diffDoneIds = [],
  diffProgressedIds = [],
  sinceDate = null,
  horizonIds = null,
  horizonEnd = null,
  scenarioShifts = null,
}) {
  const diffDoneSet = useMemo(() => new Set(diffDoneIds), [diffDoneIds]);
  const diffProgSet = useMemo(() => new Set(diffProgressedIds), [diffProgressedIds]);
  const horizonSet = useMemo(
    () => (horizonIds instanceof Set ? horizonIds : Array.isArray(horizonIds) ? new Set(horizonIds) : null),
    [horizonIds],
  );
  const { t, lang } = useT();
  const isDe = lang === 'de';
  const model = useMemo(() => computeRoadmapModel({ tree, scheduled, stats }), [tree, scheduled, stats]);

  const teamById = useMemo(() => Object.fromEntries((teams || []).map(tm => [tm.id, tm])), [teams]);
  const memberById = useMemo(() => Object.fromEntries((members || []).map(m => [m.id, m])), [members]);
  const treeById = useMemo(() => Object.fromEntries((tree || []).map(r => [r.id, r])), [tree]);

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
        <div style={{ fontSize: 14 }}>{t('tt.empty')}</div>
      </div>
    );
  }

  const shortDate = d => {
    if (!d) return '—';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${dd}.${mm}`;
  };
  const kwTag = d => `KW${isoWeek(d)}/${String(isoWeekYear(d)).slice(-2)}`;

  const statusGlyph = status => {
    if (status === 'done') return { icon: '●', color: 'var(--gr)' };
    if (status === 'wip') return { icon: '◐', color: 'var(--am)' };
    return { icon: '○', color: 'var(--tx3)' };
  };

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>{t('tt.hint')}</div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
          gap: 14,
          alignItems: 'start',
        }}
      >
        {model.lines.map((line, lineIdx) => {
          const color = line.color;
          const allStations = [...line.majorStations, ...line.minorStations].filter(st => st.clusterItems && st.clusterItems.length);

          const rows = allStations
            .map(st => {
              const items = st.clusterItems || [];
              const allSegs = items.flatMap(it => segmentsByTree[it.id] || []);
              const dated = allSegs.filter(s => s && s.startD && s.endD);
              const startD = dated.length ? new Date(Math.min(...dated.map(s => +s.startD))) : null;
              const endD = dated.length ? new Date(Math.max(...dated.map(s => +s.endD))) : null;

              const teamIds = [...new Set([...allSegs.map(s => s.team), ...items.map(it => treeById[it.id]?.team)].filter(Boolean))];
              const teamLabel = teamIds.map(id => teamById[id]?.name || id).join(' · ') || '—';

              const personIds = [...new Set(allSegs.map(s => s.personId || (s.assign && s.assign[0])).filter(Boolean))];
              const personLabel = personIds.map(id => memberById[id]?.name || id).join(', ');

              const status = st.allDone
                ? 'done'
                : dated.some(s => s.status === 'wip') || items.some(it => treeById[it.id]?.status === 'wip')
                  ? 'wip'
                  : 'open';

              const workDays = dated.reduce((sum, s) => sum + (s.workingDaysInWindow || 0), 0);
              const totalCalDays = startD && endD ? Math.max(1, Math.round((endD - startD) / 86400000) + 1) : 0;
              const current = line.currentId === st.id && !st.allDone;

              const tipLines = [st.name + (items.length > 1 ? ` (${items.length} Items)` : '')];
              if (teamLabel !== '—') tipLines.push(`${t('rv.team')}: ${teamLabel}`);
              if (personLabel) tipLines.push(`${t('g.person')}: ${personLabel}`);
              tipLines.push('');
              items.forEach(it => {
                const tr = treeById[it.id];
                const segs = segmentsByTree[it.id] || [];
                const stStatus = tr?.status || segs[0]?.status || 'open';
                const glyph = stStatus === 'done' ? '●' : stStatus === 'wip' ? '◐' : '○';
                const persons = [...new Set(segs.map(s => s.person || (s.assign && s.assign[0])).filter(Boolean))].join(', ');
                tipLines.push(`  ${glyph} ${it.name}${persons ? ` — ${persons}` : ''}`);
              });
              const doneInWindow = items.filter(it => diffDoneSet.has(it.id)).length;
              const progressedInWindow = items.filter(it => diffProgSet.has(it.id)).length;
              // What a scenario does to this station: how many of its tasks
              // move, and the furthest in each direction.
              let scnMoved = 0,
                scnLater = 0,
                scnEarlier = 0;
              if (scenarioShifts) {
                for (const it of items) {
                  if (!scenarioShifts.has(it.id)) continue;
                  scnMoved += 1;
                  const days = scenarioShifts.get(it.id) || 0;
                  if (days > scnLater) scnLater = days;
                  if (days < scnEarlier) scnEarlier = days;
                }
                if (scnMoved) {
                  tipLines.push('');
                  tipLines.push(t('tt.scnMoved', scnMoved, items.length));
                  if (scnLater) tipLines.push(`  ${t('scn.upTo', formatShift(t, scnLater))}`);
                  if (scnEarlier) tipLines.push(`  ${t('scn.upTo', formatShift(t, scnEarlier))}`);
                }
              }
              // The window's counts in words as well: a badge is two characters
              // in a narrow column, and whatever a column can clip has to be
              // readable somewhere that cannot.
              if (sinceDate && (doneInWindow || progressedInWindow)) {
                tipLines.push('');
                if (doneInWindow) tipLines.push(t('tt.winDone', doneInWindow));
                if (progressedInWindow) tipLines.push(t('tt.winProgressed', progressedInWindow));
              }
              const tip = tipLines.join('\n');
              // Horizon hit: at least one cluster item sits inside the global
              // planning window (or its end is on/before horizonEnd).
              const inHorizon = !horizonSet
                ? true
                : items.some(it => horizonSet.has(it.id)) || (horizonEnd && endD && endD <= horizonEnd && status !== 'done');
              return {
                station: st,
                items,
                startD,
                endD,
                status,
                workDays,
                totalCalDays,
                current,
                tip,
                doneInWindow,
                progressedInWindow,
                inHorizon,
                scnMoved,
                scnLater,
                scnEarlier,
              };
            })
            .filter(r => r.inHorizon)
            .sort((a, b) => (a.startD || 0) - (b.startD || 0));

          const trainRow = rows.find(r => r.current);

          return (
            <div key={lineIdx}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 4,
                  paddingBottom: 3,
                  borderBottom: `2px solid ${color}`,
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    minWidth: 30,
                    height: 16,
                    borderRadius: 3,
                    background: color,
                    color: '#fff',
                    fontFamily: 'var(--mono)',
                    fontWeight: 700,
                    fontSize: 11,
                    textAlign: 'center',
                    lineHeight: '16px',
                    padding: '0 4px',
                  }}
                >
                  {line.root.id}
                </span>
                <span style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {line.root.name}
                </span>
                {trainRow && <span style={{ marginLeft: 'auto', fontSize: 11, color, fontWeight: 600 }}>→ {trainRow.station.abbrev}</span>}
                {!trainRow && line.progress >= 1 && (
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--gr)', fontWeight: 600 }}>{t('tt.complete')}</span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {rows.map(r => {
                  const g = statusGlyph(r.status);
                  const isPast = r.endD && r.endD < today;
                  // Sprint-window highlight: amber border + tinted background when
                  // any constituent item moved in the diff window. Pulls focus to
                  // recently-touched stations during a review.
                  const movedInWindow = sinceDate && (r.doneInWindow > 0 || r.progressedInWindow > 0);
                  // A scenario's mark, in the scenario's colour — never the
                  // window's amber, which means something else.
                  const movedInScenario = r.scnMoved > 0;
                  const rowBg = movedInScenario
                    ? 'color-mix(in srgb, var(--sc) 12%, transparent)'
                    : movedInWindow
                      ? 'rgba(245,158,11,.10)'
                      : r.current
                        ? 'rgba(34,197,94,.10)'
                        : isPast && r.status === 'done'
                          ? 'transparent'
                          : 'var(--bg2)';
                  const rowOpacity = r.status === 'done' && !r.current && !movedInWindow && !movedInScenario ? 0.55 : 1;
                  return (
                    <div
                      key={r.station.id}
                      data-htip={r.tip}
                      style={{
                        display: 'grid',
                        // A column is a promise that the next row's value starts
                        // in the same place. The first one was 44px for an
                        // abbreviation, then also carried "×13" and up to two
                        // window badges, which ran over the date beside it. The
                        // abbreviation and its count get the width they need,
                        // and the badges a column of their own — there only
                        // while a review window is on, so nothing shifts at rest.
                        gridTemplateColumns: sinceDate || scenarioShifts ? '58px 58px 1fr 68px 16px' : '58px 1fr 68px 16px',
                        alignItems: 'center',
                        gap: 6,
                        padding: '3px 6px',
                        background: rowBg,
                        opacity: rowOpacity,
                        borderLeft: movedInScenario
                          ? '3px solid var(--sc)'
                          : movedInWindow
                            ? '3px solid var(--diff)'
                            : r.current
                              ? `3px solid ${color}`
                              : '3px solid transparent',
                        borderRadius: 3,
                        fontSize: 12,
                        minHeight: 22,
                      }}
                    >
                      <span
                        data-testid="tt-abbrev"
                        style={{
                          fontFamily: 'var(--mono)',
                          fontWeight: 700,
                          color,
                          fontSize: 12,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          minWidth: 0,
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.station.abbrev}</span>
                        {r.items.length > 1 && (
                          <span style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 400, flexShrink: 0 }}>×{r.items.length}</span>
                        )}
                      </span>
                      {scenarioShifts && (
                        <span
                          data-testid="tt-scenario"
                          style={{
                            fontFamily: 'var(--mono)',
                            fontSize: 10,
                            fontWeight: 700,
                            color: 'var(--sc)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            minWidth: 0,
                          }}
                        >
                          {movedInScenario
                            ? r.scnLater
                              ? formatShift(t, r.scnLater)
                              : r.scnEarlier
                                ? formatShift(t, r.scnEarlier)
                                : `×${r.scnMoved}`
                            : ''}
                        </span>
                      )}
                      {sinceDate && !scenarioShifts && (
                        <span
                          data-testid="tt-window"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            minWidth: 0,
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            fontFamily: 'var(--mono)',
                          }}
                        >
                          {r.doneInWindow > 0 && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                background: 'var(--st-done)',
                                color: '#0a0a0a',
                                borderRadius: 2,
                                padding: '0 3px',
                              }}
                            >
                              ●{r.doneInWindow}
                            </span>
                          )}
                          {/* Amber = "progressed in window", not wip — literal on purpose, see docs/design-tokens.md. */}
                          {r.progressedInWindow > 0 && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                background: 'var(--diff)',
                                color: 'var(--bg)',
                                borderRadius: 2,
                                padding: '0 3px',
                              }}
                            >
                              ▲{r.progressedInWindow}
                            </span>
                          )}
                        </span>
                      )}
                      <span
                        style={{
                          fontFamily: 'var(--mono)',
                          fontSize: 11,
                          color: 'var(--tx2)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        data-htip={r.startD && r.endD ? `${iso(r.startD)} → ${iso(r.endD)}` : undefined}
                      >
                        {r.startD && r.endD ? (
                          // Near-term (≤ 60d to start) keeps the precise KW + day-range
                          // notation. Mid- and far-term collapse to month/quarter via
                          // horizonLabel — honest granularity for distant scheduled work.
                          (r.startD - today) / 86400000 <= 60 ? (
                            <>
                              {kwTag(r.startD)} · {shortDate(r.startD)}–{shortDate(r.endD)}
                            </>
                          ) : (
                            <>
                              {horizonLabel(r.startD, null, isDe, today)} → {horizonLabel(r.endD, null, isDe, today)}
                            </>
                          )
                        ) : (
                          '—'
                        )}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', textAlign: 'right' }}>
                        {r.totalCalDays > 0 ? `${r.totalCalDays}d/${r.workDays.toFixed(0)}PT` : '—'}
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
    </div>
  );
}
