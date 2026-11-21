import { download, slug } from './fileHelpers.js';
import { svgToPng } from './svgRaster.js';

// ── SVG/PNG helpers ──────────────────────────────────────────────────────────
function buildNetworkSvg() {
  const svg = document.querySelector('.netgraph-wrap svg');
  if (!svg) return null;
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const g = clone.querySelector('g');
  if (g) g.removeAttribute('transform');
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `svg{background:#f8f9fc;--bg:#f8f9fc;--bg2:#fff;--bg3:#f0f2f5;--bg4:#e5e8ee;--b:#e0e4ea;--b2:#ccd2dc;--b3:#b0b8c8;--tx:#1a1e2a;--tx2:#4a5268;--tx3:#7a839a;--ac:#2563eb;--ac2:#1d4ed8;--gr:#16a34a;--am:#d97706;--re:#dc2626;--r:7px;--mono:'JetBrains Mono',monospace;--font:'Inter',sans-serif}text{font-family:'Inter',sans-serif}`;
  clone.prepend(style);
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  clone.querySelectorAll('g > g').forEach(n => {
    const t = n.getAttribute('transform');
    if (t) {
      const m = t.match(/translate\(([^,]+),([^)]+)\)/);
      if (m) {
        const x = +m[1],
          y = +m[2];
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + 250);
        maxY = Math.max(maxY, y + 60);
      }
    }
  });
  if (minX === Infinity) {
    minX = 0;
    minY = 0;
    maxX = 1200;
    maxY = 800;
  }
  const pad = 40,
    w = maxX - minX + pad * 2,
    h = maxY - minY + pad * 2;
  clone.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${w} ${h}`);
  clone.setAttribute('width', w);
  clone.setAttribute('height', h);
  return { svg: clone, width: w, height: h };
}

export function exportNetworkSVG(ctx) {
  const r = buildNetworkSvg();
  if (!r) return alert('Switch to the Network tab first.');
  download(new Blob([new XMLSerializer().serializeToString(r.svg)], { type: 'image/svg+xml' }), `${slug(ctx.meta.name)}-network.svg`);
}

export async function exportNetworkPNG(ctx) {
  const r = buildNetworkSvg();
  if (!r) return alert('Switch to the Network tab first.');
  try {
    const blob = await svgToPng(r.svg, r.width, r.height, 2);
    download(blob, `${slug(ctx.meta.name)}-network.png`);
  } catch (e) {
    alert('PNG export failed: ' + (e.message || e));
  }
}
