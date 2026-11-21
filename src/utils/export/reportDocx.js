import { iso } from '../date.js';
import { generateReport } from '../report.js';
import { download, slug, escapeHtml } from './fileHelpers.js';
import { svgToDataUrl } from './svgRaster.js';
// @turbodocx browser build is a classic UMD: `var HTMLToDOCX=function(){…}()`
// — relies on the `var` hoisting onto `window` when executed as a <script>.
// Vite's ESM pipeline breaks that because esm.js drags node-only deps (Buffer
// classes extending undefined globals). Load the browser file via <script>
// injection using Vite's `?url` asset import so it runs at global scope.
import turboBrowserUrl from '@turbodocx/html-to-docx/dist/html-to-docx.browser.js?url';

let _turboDocxPromise = null;
async function loadTurboDocx() {
  // turbodocx browser bundle references `global` (and `Buffer`) at runtime.
  // Script-tag injection runs the code at window scope, so Vite's
  // `define: { global: 'globalThis' }` does NOT apply (asset file, not an
  // authored module). Shim both before the <script> tag loads.
  if (typeof window !== 'undefined' && typeof window.global === 'undefined') {
    window.global = window;
  }
  if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
    const bufMod = await import('buffer');
    window.Buffer = bufMod.Buffer || bufMod.default?.Buffer;
  }
  if (typeof window !== 'undefined' && typeof window.HTMLToDOCX === 'function') {
    return window.HTMLToDOCX;
  }
  if (_turboDocxPromise) return _turboDocxPromise;
  _turboDocxPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = turboBrowserUrl;
    s.async = true;
    s.onload = () => {
      if (typeof window.HTMLToDOCX === 'function') resolve(window.HTMLToDOCX);
      else reject(new Error('turbodocx browser build did not expose HTMLToDOCX'));
    };
    s.onerror = () => reject(new Error('Failed to load turbodocx browser build'));
    document.head.appendChild(s);
  }).catch(e => {
    _turboDocxPromise = null;
    throw e;
  });
  return _turboDocxPromise;
}

// ── Report (DOCX for Confluence / Word) — HTML → DOCX via @turbodocx ─────
// The `docx` lib approach required hand-building every paragraph/table and
// fighting percentage-width rendering; Word collapsed columns and Mac users
// saw "missing font" warnings. Routing the existing HTML report through
// html-to-docx yields pixel-equivalent output to the Summary PDF with zero
// width-math and uses only system-available fonts.
export async function exportReportDocx(ctx) {
  try {
    const htmlRaw = generateReport(ctx);
    const { meta, lang } = ctx;
    const de = lang === 'de';
    const dateStr = new Date().toLocaleDateString(de ? 'de-DE' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Rasterize the inline roadmap SVG into a PNG data URL so Word renders it
    // exactly the same as the PDF (html-to-docx accepts <img src="data:...">).
    const roadmapSvgMatch = htmlRaw.match(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1400 800"[\s\S]*?<\/svg>/);
    let html = htmlRaw;
    if (roadmapSvgMatch) {
      const W = 1400,
        H = 800;
      const patched = roadmapSvgMatch[0].replace(
        /^<svg [^>]*>/,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">`,
      );
      const inlined = patched
        .replace(/var\(--tx,([^)]*)\)/g, '#1a1e2a')
        .replace(/var\(--tx2,([^)]*)\)/g, '#4a5268')
        .replace(/var\(--tx3,([^)]*)\)/g, '#7a839a')
        .replace(/var\(--bg,([^)]*)\)/g, '#ffffff')
        .replace(/var\(--bg2,([^)]*)\)/g, '#f8f9fc')
        .replace(/var\(--b2,([^)]*)\)/g, '#ccd2dc')
        .replace(/var\(--re,([^)]*)\)/g, '#ef4444')
        .replace(/var\(--tx[^)]*\)/g, '#1a1e2a')
        .replace(/var\(--tx2[^)]*\)/g, '#4a5268')
        .replace(/var\(--tx3[^)]*\)/g, '#7a839a')
        .replace(/var\(--bg[^)]*\)/g, '#ffffff');
      try {
        const dataUrl = await svgToDataUrl(inlined, W, H, 3, '#ffffff');
        html = html.replace(
          roadmapSvgMatch[0],
          `<div style="text-align:center;margin:8px 0"><img src="${dataUrl}" width="900" alt="Roadmap" /></div>`,
        );
      } catch {
        // If rasterization fails, drop the SVG to avoid breaking the document.
        html = html.replace(roadmapSvgMatch[0], '');
      }
    }

    // Use system-available fonts. JetBrains Mono triggers Mac's "missing font"
    // warning; Consolas/Courier New are universal.
    html = html.replace(/'JetBrains Mono','Cascadia Code',monospace/g, "Consolas,'Courier New',monospace");

    // html-to-docx collapses flexbox to block flow, so KPI rows and two-column
    // grids stack vertically (value/label on separate lines). Rewrite those
    // structures as proper <table>s so Word sees intended columns.
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');

      // KPI row (.kpi-row → one-row table, each .kpi becomes a <td>)
      doc.querySelectorAll('.kpi-row').forEach(row => {
        const kpis = [...row.querySelectorAll('.kpi')];
        if (!kpis.length) return;
        const table = doc.createElement('table');
        table.setAttribute('style', 'width:100%;border-collapse:collapse;margin:0 0 10px 0');
        const tr = doc.createElement('tr');
        kpis.forEach(k => {
          const v = k.querySelector('.kpi-v');
          const l = k.querySelector('.kpi-l');
          const valueColor = v?.getAttribute('style')?.match(/color:\s*([^;]+)/i)?.[1] || '#1a1e2a';
          const td = doc.createElement('td');
          td.setAttribute(
            'style',
            'padding:8px 10px;border:1px solid #e0e4ea;background:#f7f9fc;text-align:center;vertical-align:top;font-family:Inter,system-ui,sans-serif',
          );
          // A detached document built for the DOCX converter; what goes in is the
          // serialised content of elements Planr rendered itself.
          // nosemgrep: planr-no-raw-html
          td.innerHTML =
            (v
              ? `<div style="font-size:14pt;font-weight:700;color:${valueColor};line-height:1.1;margin-bottom:2px">${v.innerHTML}</div>`
              : '') +
            (l ? `<div style="font-size:8pt;color:#7a839a;text-transform:uppercase;letter-spacing:0.04em">${l.innerHTML}</div>` : '');
          tr.appendChild(td);
        });
        table.appendChild(tr);
        row.replaceWith(table);
      });

      // Roadmap legend → flat block HTML inside a multi-column table. The
      // generated legend uses nested flex containers (line column → line
      // header row → station row), which html-to-docx collapses into empty
      // cells. Extract structured bits (line id, stations, cluster items with
      // status + abbrev) and emit clean HTML so Word shows:
      //   P2  Performance / Blocks                                     ← line header
      //   ● PL  Preisfindung Logik 3/4                                 ← station (bold abbrev in line color)
      //     ◐ Preisfindung API                                         ← indented cluster item
      //     ○ Preisfindung Cache
      doc.querySelectorAll('div[style*="margin-top:16px"][style*="display:flex"][style*="flex-wrap:wrap"]').forEach(legend => {
        const cols = [...legend.children];
        if (!cols.length) return;
        // Helpers scoped to the legend parse.
        const isIndented = row => /padding-left:\s*(?:1[4-9]|[2-9]\d|\d{3,})/.test(row.getAttribute('style') || '');
        const isDone = row => /line-through/.test(row.getAttribute('style') || '');
        const guessStatus = row => {
          const txt = row.textContent || '';
          if (isDone(row)) return 'done';
          // "x/y" badge with x === y → done (shouldn't hit because of line-through above);
          // otherwise current-progress uses wip; plain unstarted stays open.
          if (/◐/.test(txt)) return 'wip';
          return /\b([1-9]\d*)\s*\/\s*([1-9]\d*)\b/.test(txt) ? 'wip' : 'open';
        };
        const statusGlyph = st => (st === 'done' ? '●' : st === 'wip' ? '◐' : '○');

        const flatCols = cols.map(col => {
          const lineHeader = col.children[0];
          const color =
            lineHeader
              ?.querySelector('span[style*="background:"]')
              ?.getAttribute('style')
              ?.match(/background:([^;]+)/i)?.[1]
              ?.trim() || '#1a1e2a';
          const headerSpans = lineHeader ? [...lineHeader.querySelectorAll('span')] : [];
          const lineId = headerSpans[1]?.textContent?.trim() || '';
          const lineName = headerSpans[2]?.textContent?.trim() || '';
          const rest = [...col.children].slice(1);
          const stationLines = rest
            .map(row => {
              const spans = [...row.querySelectorAll('span')].filter(s => s.textContent?.trim());
              const indent = isIndented(row);
              const done = isDone(row);
              const status = guessStatus(row);
              if (indent) {
                // Cluster item: one text span (name)
                return { kind: 'cluster', name: spans[0]?.textContent?.trim() || '', status, done };
              }
              // Station row: [abbrev, "Name x/y"]
              const abbrev = spans[0]?.textContent?.trim() || '';
              // Trailing count like " 3/5" lives at the end of the name span;
              // split it off so we can format it separately.
              const nameRaw = spans[1]?.textContent?.trim() || '';
              const countMatch = nameRaw.match(/\s*(\d+\/\d+|✓)\s*$/);
              const count = countMatch ? countMatch[1] : '';
              const name = count ? nameRaw.slice(0, nameRaw.length - countMatch[0].length).trim() : nameRaw;
              return { kind: 'station', abbrev, name, count, status, done };
            })
            .filter(s => s.name || s.abbrev);
          return { color, lineId, lineName, stationLines };
        });

        const table = doc.createElement('table');
        table.setAttribute('style', 'width:100%;border-collapse:collapse;margin:12px 0 16px 0');
        const perRow = Math.min(3, flatCols.length);
        for (let i = 0; i < flatCols.length; i += perRow) {
          const tr = doc.createElement('tr');
          for (let j = 0; j < perRow; j++) {
            const td = doc.createElement('td');
            td.setAttribute(
              'style',
              `width:${Math.floor(100 / perRow)}%;padding:8px 10px;vertical-align:top;border:1px solid #e0e4ea;background:#fafbfd`,
            );
            const data = flatCols[i + j];
            if (data) {
              const parts = [];
              parts.push(
                `<div style="margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid ${data.color}44">` +
                  `<span style="display:inline-block;background:${data.color};color:#fff;font-weight:700;padding:1px 6px;border-radius:3px;font-size:10px;font-family:'Courier New',monospace">${escapeHtml(data.lineId)}</span>` +
                  (data.lineName ? ` <span style="font-size:11px;font-weight:600;color:#1a1e2a">${escapeHtml(data.lineName)}</span>` : '') +
                  `</div>`,
              );
              // Single font stack throughout. Indentation for cluster items
              // uses <p> with margin-left — html-to-docx maps paragraph margins
              // onto Word's w:ind indent (plain div margin-left is ignored).
              // Abbrev ↔ name gap + indent icons use fixed-width inline-block
              // spacer spans so html-to-docx preserves them as literal runs.
              const FONT = "'Inter','Segoe UI',system-ui,sans-serif";
              const INDENT_PX = 60; // cluster indent ≈ 10 chars Inter 10pt
              data.stationLines.forEach(s => {
                // A team's colour comes from the plan and ends up in a style
                // attribute: only what a colour can look like gets through.
                const iconColor = /^[#\w(),.%\s-]{1,40}$/.test(String(data.color || '')) ? data.color : '#4a5268';
                const strike = s.done ? 'text-decoration:line-through;opacity:0.6;' : '';
                if (s.kind === 'station') {
                  parts.push(
                    `<p style="font-family:${FONT};font-size:10.5px;margin:2px 0;${strike}">` +
                      `<span style="color:${iconColor};font-weight:700">${statusGlyph(s.status)}</span>` +
                      `<span style="display:inline-block;width:14px"></span>` +
                      `<span style="color:${iconColor};font-weight:700">${escapeHtml(s.abbrev)}</span>` +
                      (s.name
                        ? `<span style="display:inline-block;width:28px"></span><span style="color:${iconColor};font-weight:700">${escapeHtml(s.name)}</span>`
                        : '') +
                      (s.count ? ` <span style="color:#7a839a;font-weight:400;font-size:9.5px">${escapeHtml(s.count)}</span>` : '') +
                      `</p>`,
                  );
                } else {
                  parts.push(
                    `<p style="font-family:${FONT};font-size:10px;margin:1px 0 1px ${INDENT_PX}px;${strike}">` +
                      `<span style="color:${iconColor}">${statusGlyph(s.status)}</span>` +
                      `<span style="display:inline-block;width:10px"></span>` +
                      `<span style="color:#4a5268;font-weight:400">${escapeHtml(s.name)}</span>` +
                      `</p>`,
                  );
                }
              });
              // Same detached document. Every piece of plan text in `parts` went
              // through escapeHtml, and the colour is checked above.
              // nosemgrep: planr-no-raw-html
              td.innerHTML = parts.join('');
            }
            tr.appendChild(td);
          }
          table.appendChild(tr);
        }
        legend.replaceWith(table);
      });

      // Two-column grid (.grid2 → table with 2 tds per row)
      doc.querySelectorAll('.grid2').forEach(grid => {
        const cards = [...grid.children];
        if (!cards.length) return;
        const table = doc.createElement('table');
        table.setAttribute('style', 'width:100%;border-collapse:collapse;margin:0 0 10px 0');
        for (let i = 0; i < cards.length; i += 2) {
          const tr = doc.createElement('tr');
          [cards[i], cards[i + 1]].forEach(card => {
            const td = doc.createElement('td');
            td.setAttribute('style', 'width:50%;padding:4px;vertical-align:top');
            if (card) td.appendChild(card.cloneNode(true));
            tr.appendChild(td);
          });
          table.appendChild(tr);
        }
        grid.replaceWith(table);
      });

      // Progress/confidence bar strips (.bar, .conf-bar) — <div> with flex
      // children. Replace with a 1-row table so segment widths render side by
      // side in Word. Skip if no children have explicit width.
      doc.querySelectorAll('.bar, .conf-bar').forEach(bar => {
        const segs = [...bar.children].filter(c => c.style?.width);
        if (!segs.length) return;
        const table = doc.createElement('table');
        table.setAttribute('style', 'width:100%;border-collapse:collapse;height:8px;margin:4px 0 8px 0');
        const tr = doc.createElement('tr');
        segs.forEach(seg => {
          const td = doc.createElement('td');
          const bg = seg.getAttribute('style')?.match(/background:\s*([^;]+)/i)?.[1] || '#e5e8ee';
          const w = seg.getAttribute('style')?.match(/width:\s*([^;]+)/i)?.[1] || '0';
          td.setAttribute('style', `background:${bg};width:${w};height:8px;padding:0;line-height:8px;font-size:1px`);
          // A literal.
          // nosemgrep: planr-no-raw-html
          td.innerHTML = '&nbsp;';
          tr.appendChild(td);
        });
        table.appendChild(tr);
        bar.replaceWith(table);
      });

      html = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
    } catch (e) {
      // Non-fatal: if DOMParser or replacement fails, we still hand the raw
      // HTML to html-to-docx which produces the previous (block-stacked) output.
      console.warn('[exportReportDocx] HTML pre-processing failed; falling back to raw report HTML', e);
    }

    const HTMLtoDOCX = await loadTurboDocx();
    const header = `<div style="font-size:9px;color:#7a839a">${meta.name || 'Project'} — ${de ? 'Projektbericht' : 'Project Report'}</div>`;
    const footer = `<div style="font-size:8px;color:#7a839a;text-align:center">${dateStr} · Planr</div>`;
    const out = await HTMLtoDOCX(
      html,
      header,
      {
        orientation: 'landscape',
        margins: { top: 720, right: 720, bottom: 720, left: 720, header: 360, footer: 360 },
        title: `${meta.name || 'Project'} — ${de ? 'Projektbericht' : 'Project Report'}`,
        creator: 'Planr',
        font: 'Calibri',
        fontSize: 20, // half-points — 20 = 10pt
        header: true,
        footer: true,
        pageNumber: true,
        table: { row: { cantSplit: true } },
      },
      footer,
    );

    const blob =
      out instanceof Blob ? out : new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    download(blob, `${slug(meta.name)}-summary-${iso(new Date())}.docx`);
  } catch (e) {
    console.error(e);
    alert('Word export failed: ' + (e.message || e));
  }
}
