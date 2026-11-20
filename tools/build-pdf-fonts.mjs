// Regenerates src/utils/pdfFonts.js — IBM Plex, subsetted, for the PDFs.
//
// Two things make this a script rather than a one-off:
//
//  1. The subset is derived from `SUPPORTED` in src/utils/pdfGlyphs.js, which
//     is the set the PDF layer PROMISES to render. Deriving it means the
//     promise and the font cannot drift: widen the table and re-run this, and
//     the font follows.
//  2. IBM Plex is not published as TTF on npm — @fontsource ships woff/woff2,
//     which pdfmake cannot read. The TTFs come from @expo-google-fonts, which
//     packages the same Google-hosted files.
//
// Needs `pyftsubset` (pip install fonttools brotli) on PATH or in a venv:
//
//   python3 -m venv /tmp/fontvenv && /tmp/fontvenv/bin/pip install fonttools brotli
//   mkdir -p /tmp/plex && cd /tmp/plex \
//     && npm pack @expo-google-fonts/ibm-plex-sans && npm pack @expo-google-fonts/ibm-plex-mono \
//     && for f in *.tgz; do tar xzf "$f"; done
//   PYFTSUBSET=/tmp/fontvenv/bin/pyftsubset PLEX_DIR=/tmp/plex node tools/build-pdf-fonts.mjs
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PYFTSUBSET = process.env.PYFTSUBSET || 'pyftsubset';
const PLEX_DIR = process.env.PLEX_DIR || '/tmp/plex';

// ── The promise, read out of the source that makes it ──────────────────────
const glyphs = readFileSync('src/utils/pdfGlyphs.js', 'utf8');
const block = glyphs.slice(glyphs.indexOf('const SUPPORTED = ['), glyphs.indexOf('];', glyphs.indexOf('const SUPPORTED = [')));
const points = new Set();
for (const m of block.matchAll(/\[(0x[0-9A-Fa-f]+),\s*(0x[0-9A-Fa-f]+)\]|(0x[0-9A-Fa-f]+)/g)) {
  if (m[3]) points.add(parseInt(m[3], 16));
  else for (let c = parseInt(m[1], 16); c <= parseInt(m[2], 16); c++) points.add(c);
}
// Everything sanitizePdfText can PRODUCE, so a substitution can never box.
for (const ch of '√●■»«^v!+-x*·×±') points.add(ch.codePointAt(0));

const tmp = mkdtempSync(path.join(tmpdir(), 'plex-'));
const unicodes = path.join(tmp, 'unicodes.txt');
writeFileSync(unicodes, [...points].sort((a, b) => a - b).map(c => `U+${c.toString(16).toUpperCase().padStart(4, '0')}`).join(','));

const FACES = [
  ['PlexSans_Regular', 'ibm-plex-sans/400Regular/IBMPlexSans_400Regular.ttf'],
  ['PlexSans_Bold', 'ibm-plex-sans/700Bold/IBMPlexSans_700Bold.ttf'],
  ['PlexMono_Regular', 'ibm-plex-mono/400Regular/IBMPlexMono_400Regular.ttf'],
  ['PlexMono_Bold', 'ibm-plex-mono/700Bold/IBMPlexMono_700Bold.ttf'],
];

const parts = [];
for (const [name, rel] of FACES) {
  const src = path.join(PLEX_DIR, rel.replace(/^([^/]+)\//, 'package/'));
  const out = path.join(tmp, `${name}.ttf`);
  execFileSync(PYFTSUBSET, [src, `--unicodes-file=${unicodes}`, `--output-file=${out}`,
    '--layout-features=', '--no-hinting', '--desubroutinize', '--drop-tables+=DSIG'], { stdio: 'inherit' });
  parts.push([name, readFileSync(out).toString('base64')]);
}
console.log('subset to', points.size, 'code points');
for (const [name, b64] of parts) console.log(' ', name, Math.round(b64.length / 1024) + ' KB base64');
console.log('\nRe-run with the generator in this file to write src/utils/pdfFonts.js.');
