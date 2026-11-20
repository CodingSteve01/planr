// Background grid of the Gantt timeline: week columns, day grid, holiday and weekend
// tint, the today line, horizon bands and deadline masts. Stateless, pointer-events none.

import React from 'react';
import { addD } from '../../../utils/date.js';

export function GanttGridLayer({ tw, weeks, WPX, showDays, wdSet, DPX, planStart, dateToX, t, todayX, now, h1Weeks, h2Weeks, dlL }) {
  return (
    <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: tw, pointerEvents: 'none', zIndex: 0 }}>
      {/* Week columns. When the day grid is visible we don't tint the whole week red —
        individual holiday days get tinted below instead. */}
      {weeks.map((w, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: i * WPX,
            top: 0,
            width: WPX,
            height: '100%',
            borderRight: '1px solid var(--b)',
            background: !showDays && w.hasH ? 'rgba(244,63,94,.10)' : '',
          }}
        />
      ))}
      {/* Day-level overlays: all 7 days. Weekends grayed, holidays red-tinted, separators. */}
      {showDays &&
        weeks.map((w, i) => {
          const wdsByTime = new Set(w.wds.map(d => d.getTime()));
          return [0, 1, 2, 3, 4, 5, 6].map(d => {
            const date = addD(w.mon, d);
            const dow = date.getDay();
            const isWeekend = !wdSet.has(dow);
            const isHoliday = !isWeekend && !wdsByTime.has(date.getTime());
            return (
              <React.Fragment key={`d-${i}-${d}`}>
                {isWeekend && (
                  <div
                    style={{
                      position: 'absolute',
                      left: i * WPX + d * DPX,
                      top: 0,
                      width: DPX,
                      height: '100%',
                      background: 'rgba(127,127,127,.10)',
                    }}
                  />
                )}
                {isHoliday && (
                  <div
                    style={{
                      position: 'absolute',
                      left: i * WPX + d * DPX,
                      top: 0,
                      width: DPX,
                      height: '100%',
                      background: 'rgba(244,63,94,.14)',
                    }}
                  />
                )}
                {d > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: i * WPX + d * DPX,
                      top: 0,
                      width: 1,
                      height: '100%',
                      background: isWeekend ? 'var(--b2)' : 'var(--b2)',
                      opacity: isWeekend ? 0.2 : 0.35,
                    }}
                  />
                )}
              </React.Fragment>
            );
          });
        })}
      {/* Pre-planStart zone: striped overlay for the rendering area before the scheduling horizon */}
      {(() => {
        const psX = planStart ? dateToX(new Date(planStart)) : 0;
        return psX > 0 ? (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: psX,
              height: '100%',
              background:
                'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(127,127,127,.06) 4px, rgba(127,127,127,.06) 8px)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
            data-htip={t('g.prePlanStartTip')}
          />
        ) : null;
      })()}
      {/* Past zone: subtle dim overlay for everything before today */}
      {todayX > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: todayX,
            height: '100%',
            background: 'rgba(0,0,0,.06)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}
      {/* Today marker — always day-accurate */}
      {todayX >= 0 && (
        <div
          style={{
            position: 'absolute',
            left: todayX,
            top: 0,
            width: 2,
            height: '100%',
            background: 'var(--gr)',
            opacity: 0.7,
            zIndex: 5,
          }}
        />
      )}
      {/* Horizon lines: H1 (committed boundary) and H2 (estimated boundary) */}
      {(() => {
        const h1Date = new Date(now);
        h1Date.setDate(h1Date.getDate() + h1Weeks * 7);
        const h2Date = new Date(now);
        h2Date.setDate(h2Date.getDate() + h2Weeks * 7);
        const h1X = dateToX(h1Date);
        const h2X = dateToX(h2Date);
        return (
          <>
            {h1X > 0 && h1X < tw && (
              <div
                style={{
                  position: 'absolute',
                  left: h1X,
                  top: 0,
                  width: 0,
                  height: '100%',
                  borderLeft: '2px dashed var(--ac)',
                  opacity: 0.35,
                  zIndex: 3,
                }}
                data-htip={t('g.h1LineTip', h1Weeks)}
              />
            )}
            {h1X > 0 && h1X < tw && (
              <div
                style={{
                  position: 'absolute',
                  left: h1X + 4,
                  top: 2,
                  fontSize: 10,
                  color: 'var(--ac)',
                  opacity: 0.5,
                  fontFamily: 'var(--mono)',
                  zIndex: 4,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}
              >
                H1 · {h1Weeks}w
              </div>
            )}
            {h2X > 0 && h2X < tw && (
              <div
                style={{
                  position: 'absolute',
                  left: h2X,
                  top: 0,
                  width: 0,
                  height: '100%',
                  borderLeft: '2px dashed var(--am)',
                  opacity: 0.3,
                  zIndex: 3,
                }}
                data-htip={t('g.h2LineTip', h2Weeks)}
              />
            )}
            {h2X > 0 && h2X < tw && (
              <div
                style={{
                  position: 'absolute',
                  left: h2X + 4,
                  top: 2,
                  fontSize: 10,
                  color: 'var(--am)',
                  opacity: 0.5,
                  fontFamily: 'var(--mono)',
                  zIndex: 4,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}
              >
                H2 · {h2Weeks}w
              </div>
            )}
          </>
        );
      })()}
      {dlL.map(dl => {
        const x = dl.x;
        const col = dl.severity === 'critical' ? 'var(--re)' : 'var(--am)';
        // Backfill: gentle gradient fading from the deadline mast to the left, so the eye
        // naturally traces the runway leading up to the date. Capped at 8 weeks.
        const backfillW = Math.min(x, 8 * WPX);
        const titleStr = `${dl.name} ${dl.date}${dl.isLate ? ` — ${t('s.atRisk')}` : ''}`;
        return (
          <React.Fragment key={dl.id}>
            {backfillW > 0 && (
              <div
                style={{
                  position: 'absolute',
                  left: x - backfillW,
                  top: 0,
                  width: backfillW,
                  height: '100%',
                  background: `linear-gradient(to right, transparent, ${dl.severity === 'critical' ? 'rgba(244,63,94,.14)' : 'rgba(245,158,11,.14)'})`,
                  pointerEvents: 'none',
                  zIndex: 3,
                }}
                data-htip={titleStr}
              />
            )}
            {/* Mast: vertical line at the exact deadline date */}
            <div
              style={{ position: 'absolute', left: x, top: 0, width: 2, height: '100%', background: col, opacity: 0.7, zIndex: 4 }}
              data-htip={titleStr}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}
