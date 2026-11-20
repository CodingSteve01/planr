import { leafProgress } from '../../../utils/scheduler.js';
import { normalizePhases, phaseWeightShares } from '../../../utils/phases.js';
import { EMPTY_ARR, loadHeatStroke } from '../../../utils/gantt/helpers.js';

// The layers drawn inside a task bar, under its label: progress, diff wash,
// phase segments, handoff, done, load strip and clipped absence bands.
export function BarOverlays({
  node,
  s,
  _diffActive,
  isSummary,
  diffPastLeafState,
  t,
  _diffDoneSet,
  loadCells,
  vacBandsByTaskId,
  barLeft,
  bW,
}) {
  return (
    <>
      {/* Progress overlay: lighter strip on the left proportional to progress %.
  When the diff overlay is active the band is split: the part up to the
  past-progress percentage stays neutral, the slice between past and now
  is amber so the "gained in window" portion stands out. */}
      {(() => {
        const prog = leafProgress(node || s);
        if (!(prog > 0 && prog < 100)) return null;
        const past = _diffActive && !isSummary && diffPastLeafState?.get?.(s.id);
        const pastProg = past ? Math.max(0, Math.min(prog, past.progress || 0)) : null;
        const gained = pastProg != null && prog - pastProg > 0.5 ? prog - pastProg : 0;
        return (
          <>
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${pastProg != null ? pastProg : prog}%`,
                background: isSummary ? 'rgba(127,127,127,.18)' : 'rgba(255,255,255,.18)',
                borderRadius: isSummary ? '5px 0 0 5px' : '4px 0 0 4px',
                pointerEvents: 'none',
              }}
              data-htip={t('g.progressDoneTip', prog) + (past ? t('g.progressPrevSuffix', past.progress || 0) : '')}
            />
            {gained > 0 && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    left: `${pastProg}%`,
                    top: 0,
                    bottom: 0,
                    width: `${gained}%`,
                    background: 'rgba(245,158,11,.55)',
                    pointerEvents: 'none',
                  }}
                  data-htip={t('g.progressGainedTip', Math.round(gained))}
                />
                {/* Sharp tick at the past-progress position so the eye locks onto
          "we started the window here". */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${pastProg}%`,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    background: 'var(--diff)',
                    pointerEvents: 'none',
                  }}
                />
              </>
            )}
          </>
        );
      })()}
      {/* Newly-done bar in window: subtle green wash so completions read
  even though the live bar already shows status=done. */}
      {_diffActive && _diffDoneSet.has(s.id) && !isSummary && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            background: 'rgba(16,185,129,.18)',
            pointerEvents: 'none',
            borderRadius: 4,
          }}
        />
      )}
      {/* Phase segments overlay */}
      {!isSummary &&
        node?.phases?.length > 1 &&
        (() => {
          const phases = normalizePhases(node.phases);
          const shares = phaseWeightShares(phases);
          return (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                right: 0,
                display: 'flex',
                pointerEvents: 'none',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              {phases.map((ph, pi) => (
                <div
                  key={ph.id || pi}
                  style={{
                    flex: `${shares[pi] || 1} 0 0`,
                    borderRight: pi < phases.length - 1 ? '1px solid rgba(0,0,0,.2)' : 'none',
                    background: ph.status === 'done' ? 'rgba(255,255,255,.15)' : ph.status === 'wip' ? 'transparent' : 'rgba(0,0,0,.12)',
                  }}
                  data-htip={`${ph.name}: ${ph.status}${ph.effortPct ? ` · ${ph.effortPct}%` : ''}`}
                />
              ))}
            </div>
          );
        })()}
      {/* Primary rows of chained tasks carry `hasHandoffSegments`
  only as metadata — the handoff-shadow rows render their
  own bars beneath and carry the visual badges. No overlay
  on the primary bar. */}
      {!isSummary && s.isHandoff && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: s.unscheduled
              ? 'repeating-linear-gradient(45deg, rgba(220,38,38,.7) 0 6px, rgba(220,38,38,.25) 6px 12px)'
              : s.crossTeam
                ? 'repeating-linear-gradient(135deg, rgba(255,255,255,.15) 0 4px, transparent 4px 10px)'
                : 'transparent',
            pointerEvents: 'none',
          }}
        />
      )}
      {!isSummary && s.isHandoff && (
        <div
          style={{
            position: 'absolute',
            top: -1,
            right: -1,
            fontSize: 10,
            fontWeight: 700,
            color: '#fff',
            background: s.unscheduled
              ? 'rgba(220,38,38,.95)'
              : s.plannedHandoff
                ? 'rgba(34,197,94,.95)'
                : s.crossTeam
                  ? 'rgba(245,158,11,.95)'
                  : 'rgba(168,85,247,.95)',
            padding: '1px 5px',
            borderRadius: '0 4px 0 4px',
            pointerEvents: 'none',
          }}
        >
          {s.unscheduled ? '! Offen' : s.plannedHandoff ? '● Plan' : s.crossTeam ? '↗ Cross' : '↳ Handoff'}
        </div>
      )}
      {s.status === 'done' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: isSummary ? 'rgba(119,128,138,.08)' : 'rgba(119,128,138,.16)',
            borderRadius: isSummary ? 5 : 4,
            pointerEvents: 'none',
          }}
        />
      )}
      {/* The same rule the row strip follows, on the bar itself:
  a line along its foot, never a wash across it. Filling the
  bar meant the load colour and the bar's own state colour
  competed for the same pixels and neither read — which is
  the opposite of what an overlay is for. */}
      {loadCells.length > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            borderRadius: isSummary ? 5 : 4,
            overflow: 'hidden',
          }}
        >
          {loadCells.map(cell => (
            <div
              key={`bar-load-${cell.wi}`}
              style={{
                position: 'absolute',
                left: cell.left,
                bottom: 0,
                height: 3,
                width: cell.width,
                background: loadHeatStroke(cell.percent, cell),
              }}
            />
          ))}
        </div>
      )}
      {/* Absence, clipped to the bar.
  Three shapes, and the third is the one a Gantt actually
  wants. It began as an amber block at full ROW height on
  every task row of the person away — a hundred blocks for
  one week off. Then a line, which stopped the wash and made
  absence a decoration on the bar: 3px of colour saying
  nothing about what it interrupts.
  What it interrupts is the point. An absence inside a bar
  is the stretch where no work happens — the reason five days
  of work span three weeks — so it is drawn as a HOLE in the
  bar: full height, hatched, the bar's own fill showing
  through the gaps. The bar visibly pauses there and resumes,
  which is what happened. Clipped to the bar, so a holiday
  two months away still says nothing about this task and
  cannot wash the chart.
  Always drawn: it is a fact about the work, not a reading
  you switch on. Load stays a line on the foot — solid, under
  the hatching — so the two never read as the same thing. */}
      {!isSummary &&
        (() => {
          const bands = vacBandsByTaskId[s.id] || EMPTY_ARR;
          if (!bands.length) return null;
          const clipped = bands
            .map(band => {
              const left = Math.max(0, band.x1 - barLeft);
              const right = Math.min(Math.max(bW, 6), band.x1 + band.width - barLeft);
              return right - left > 1 ? { band, left, width: right - left } : null;
            })
            .filter(Boolean);
          if (!clipped.length) return null;
          return (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                borderRadius: isSummary ? 5 : 4,
                overflow: 'hidden',
              }}
            >
              {clipped.map(({ band, left, width }) => (
                <div
                  key={band.key}
                  style={{
                    position: 'absolute',
                    left,
                    width,
                    top: 0,
                    bottom: 0,
                    // Faint enough to read the bar's own label straight
                    // through it — at full strength the hatching simply
                    // ate the name, which is the one thing on a bar you
                    // must be able to read. The EDGES carry the meaning
                    // instead: two solid seams say exactly where the pause
                    // starts and ends, and the wash between them says it
                    // is one stretch rather than two marks.
                    background: 'repeating-linear-gradient(45deg, var(--st-wip) 0 2px, transparent 2px 6px)',
                    opacity: 0.3,
                    boxShadow: 'inset 1.5px 0 0 var(--st-wip), inset -1.5px 0 0 var(--st-wip)',
                    // No tooltip of its own: the bar's tooltip is already
                    // up while the pointer is on the bar, and a second
                    // one over it made two stacked boxes. The bar's tip
                    // lists the vacation instead (Tooltip.jsx).
                    pointerEvents: 'none',
                  }}
                  data-vac-band={`${band.from}_${band.to}`}
                />
              ))}
            </div>
          );
        })()}
    </>
  );
}
