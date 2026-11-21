import { splitSvgMarkup, renderRoadmapSvg } from '../roadmap.js';
import { PDF_GLYPH_MAP } from '../pdfGlyphs.js';
import { PRINT } from '../printPalette.js';

// ── Prepare roadmap SVG for pdfmake's native SVG embed ─────────────────────
// pdfmake renders vector SVG directly via `{svg: <string>}`. Zero canvas
// rasterization, zero Image-loading drama with <style>/var() blocks. Only
// requirements: explicit width/height on the root <svg>, no CSS custom
// properties unresolved, and no external references.
function prepareRoadmapSvg(svgStr) {
  if (!svgStr || !svgStr.startsWith('<svg')) return null;
  // The renderer appends an HTML legend after the drawing; the PDF builds its
  // own legend from the model (buildRoadmapLegendPdf), so what follows the
  // </svg> is nothing but trailing junk to an SVG renderer.
  const [drawing] = splitSvgMarkup(svgStr);
  // Keep the renderer's own viewBox. It crops to the lanes in use and grows
  // past 800 once a plan has more than eight projects; pinning `0 0 1400 800`
  // here showed a window onto the board that no longer matched it — the top
  // lane pressed against the edge, the bottom one past the box.
  const vb = drawing.match(/^<svg [^>]*viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/);
  const [x, y, W, H] = vb ? vb.slice(1).map(Number) : [0, 0, 1400, 800];
  let patched = drawing.replace(
    /^<svg [^>]*>/,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${x} ${y} ${W} ${H}" preserveAspectRatio="xMidYMid meet">`,
  );
  // The roadmap CSS uses `stroke:var(--bg,#0e1116)` with `stroke-width:3.4`
  // on .rm-abbrev. Browser respects `paint-order: stroke fill` so the colored
  // fill ends up on top of the halo. svg-to-pdfkit (pdfmake's SVG renderer)
  // does NOT honor paint-order — it always paints fill first, stroke last —
  // so the white stroke ends up covering the colored fill, making every
  // station label literally white-on-white. Also: 'JetBrains Mono' is not
  // registered with pdfmake; svg-to-pdfkit silently swaps fonts which can
  // suppress the text. Drop the stroke entirely and use Roboto (the bundled
  // VFS font) so the labels actually render and stay readable.
  patched = patched.replace(/\.rm-abbrev\{[^}]*\}/, `.rm-abbrev{font:700 10.5px/1 Roboto,sans-serif;fill:${PRINT.ink};stroke:none}`);
  // The end-of-line route badges also pull JetBrains Mono — keep the white
  // fill but pin them to Roboto so the text doesn't disappear.
  patched = patched.replace(/\.rm-badge\{[^}]*\}/, `.rm-badge{font:800 13px/1 Roboto,sans-serif;fill:#fff;letter-spacing:.04em}`);
  // Symbols the bundled Roboto does not carry render as a missing-glyph box.
  // Embedded SVG bypasses the docDefinition sanitizer (svg-to-pdfkit does its
  // own text handling), so apply the same substitution by hand — including the
  // SVG-only swaps, because this is drawn in Roboto rather than Plex.
  patched = swapUnsupportedGlyphs(patched);
  return (
    patched
      .replace(/var\(--tx,([^)]*)\)/g, PRINT.ink)
      .replace(/var\(--tx2,([^)]*)\)/g, PRINT.ink2)
      // Dark enough to read on white — original #7a839a + thin halo was too faint.
      .replace(/var\(--tx3,([^)]*)\)/g, PRINT.ink2)
      .replace(/var\(--bg,([^)]*)\)/g, PRINT.paper)
      .replace(/var\(--bg2,([^)]*)\)/g, PRINT.ground)
      .replace(/var\(--b,([^)]*)\)/g, PRINT.rule)
      .replace(/var\(--b2,([^)]*)\)/g, PRINT.rule2)
      .replace(/var\(--re,([^)]*)\)/g, PRINT.risk)
      .replace(/var\(--ac,([^)]*)\)/g, PRINT.accent)
      .replace(/var\(--tx[^)]*\)/g, PRINT.ink)
      .replace(/var\(--tx2[^)]*\)/g, PRINT.ink2)
      .replace(/var\(--tx3[^)]*\)/g, PRINT.ink2)
      .replace(/var\(--bg[^)]*\)/g, PRINT.paper)
      .replace(/var\(--b[^)]*\)/g, PRINT.rule)
      .replace(/var\(--re[^)]*\)/g, PRINT.risk)
      .replace(/var\(--ac[^)]*\)/g, PRINT.accent)
  );
}

// Same job as prepareRoadmapSvg, for the project-roadmap renderer: pin the
// size, resolve the theme variables to print colours and drop the fonts
// pdfmake does not carry. Kept separate because this SVG has its own class
// names and a variable height.
function prepareProjectRoadmapSvg(svgStr, height) {
  if (!svgStr || !svgStr.startsWith('<svg')) return null;
  const H = Math.max(120, Math.round(height || 320));
  return (
    swapUnsupportedGlyphs(svgStr)
      .replace(
        /^<svg [^>]*>/,
        `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${H}" viewBox="0 0 1400 ${H}" preserveAspectRatio="xMidYMid meet">`,
      )
      // svg-to-pdfkit only has the bundled Roboto — anything else silently
      // drops the text (see prepareRoadmapSvg).
      .replace(/'JetBrains Mono',ui-monospace,monospace/g, 'Roboto,sans-serif')
      .replace(/'Inter',system-ui,sans-serif/g, 'Roboto,sans-serif')
      .replace(/var\(--tx,([^)]*)\)/g, PRINT.ink)
      .replace(/var\(--tx2,([^)]*)\)/g, PRINT.ink2)
      .replace(/var\(--tx3,([^)]*)\)/g, PRINT.ink2)
      .replace(/var\(--bg2,([^)]*)\)/g, PRINT.ground)
      .replace(/var\(--bg,([^)]*)\)/g, PRINT.paper)
      .replace(/var\(--b2,([^)]*)\)/g, PRINT.rule2)
      .replace(/var\(--b,([^)]*)\)/g, PRINT.rule)
      .replace(/var\(--[a-z0-9]+[^)]*\)/g, PRINT.ink)
  );
}

// Same substitution pass the docDefinition gets, for the glyphs that can end
// up inside an SVG label (a task called "Release → UAT", say).
//
// Plus a second pass the docDefinition does NOT need. Embedded SVG is drawn by
// svg-to-pdfkit against pdfmake's bundled Roboto, not the Plex faces the rest
// of the document uses, and Roboto has no arrows — so the very characters
// PDF_GLYPH_MAP maps TOWARDS come out as empty boxes in here. An en dash says
// the same thing about a date range and about a handover.
const SVG_ONLY_SWAPS = { '→': '–', '←': '–', '↑': '^', '↓': 'v', '◊': '○' };

function swapUnsupportedGlyphs(svgStr) {
  let out = svgStr;
  Object.entries(PDF_GLYPH_MAP).forEach(([from, to]) => {
    out = out.split(from).join(to);
  });
  Object.entries(SVG_ONLY_SWAPS).forEach(([from, to]) => {
    out = out.split(from).join(to);
  });
  return out;
}

function buildRoadmapSvgForPdf(ctx) {
  const { tree, scheduled, stats, diff, horizonIds, horizonEnd, futureProgressByRootId, roadmapAssignment } = ctx;
  // Forward every prop the on-screen Roadmap (Roadmap.jsx:26-28) feeds into
  // renderRoadmapSvg. Without these the PDF re-computes assignment from
  // scratch, drops diff/horizon overlays, and rebuilds train positions —
  // making the export disagree with what the user sees on screen.
  const svgStr = renderRoadmapSvg({
    tree,
    scheduled,
    stats,
    diff,
    horizonIds,
    horizonEnd,
    futureProgressByRootId,
    assignment: roadmapAssignment,
    expandedLegendIds: new Set(),
  });
  return prepareRoadmapSvg(svgStr);
}

export { prepareProjectRoadmapSvg, buildRoadmapSvgForPdf };
