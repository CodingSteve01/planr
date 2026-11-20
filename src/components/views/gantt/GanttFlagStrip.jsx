// Sticky strip above the Gantt rows: load heat cells, horizon and deadline flags.
// Stateless; the parent owns the data and the click handlers.

import React from 'react';
import { loadHeatColor, loadHeatStroke } from '../../../utils/gantt/helpers.js';

export function GanttFlagStrip({ FLAG_ROW_H, showLoadHeatmap, loadWeekSummary, setGB, WPX, dlL, t }) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 8,
        height: FLAG_ROW_H,
        borderBottom: '1px solid var(--b)',
        background: 'var(--bg)',
        boxShadow: '0 1px 0 var(--b)',
      }}
    >
      {showLoadHeatmap &&
        loadWeekSummary.map(cell => {
          const pct = cell.maxPercent || 0;
          const isRisk = pct >= 90 && !cell.historicalOnly;
          const h = isRisk ? FLAG_ROW_H : 5;
          const top = isRisk ? 0 : FLAG_ROW_H - h;
          return (
            <div
              key={`load-strip-${cell.wi}`}
              data-htip={cell.tip}
              onClick={() => setGB('resource')}
              style={{
                position: 'absolute',
                left: cell.wi * WPX,
                top,
                width: WPX,
                height: h,
                background: pct > 0 ? loadHeatColor(pct, cell) : 'transparent',
                borderBottom: pct > 0 ? `2px solid ${loadHeatStroke(pct, cell)}` : 'none',
                opacity: pct > 0 ? (isRisk ? 0.88 : 0.62) : 0,
                cursor: pct > 0 ? 'pointer' : 'default',
                zIndex: 0,
                pointerEvents: pct > 0 ? 'auto' : 'none',
              }}
            />
          );
        })}
      {dlL.map(dl => {
        const x = dl.x;
        const col = dl.severity === 'critical' ? 'var(--re)' : 'var(--am)';
        const titleStr = `${dl.name} ${dl.date}${dl.isLate ? ` — ${t('s.atRisk')}` : ''}`;
        return (
          <React.Fragment key={`flag-${dl.id}`}>
            <div
              style={{
                position: 'absolute',
                left: x,
                top: 0,
                width: 2,
                height: FLAG_ROW_H,
                background: col,
                opacity: 0.8,
                zIndex: 2,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: x,
                top: 1,
                display: 'flex',
                alignItems: 'center',
                maxWidth: 120,
                pointerEvents: 'auto',
                zIndex: 3,
              }}
              data-htip={titleStr}
            >
              <div
                style={{
                  background: col,
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: 'var(--mono)',
                  padding: '2px 6px 2px 8px',
                  letterSpacing: '.02em',
                  clipPath: 'polygon(6px 0, 100% 0, calc(100% - 4px) 50%, 100% 100%, 6px 100%, 0 50%)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 118,
                }}
              >
                {dl.isLate ? '! ' : ''}
                {dl.name}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
