// Which vault files are offered to Planr: "Open in Planr" in the file menu and
// the "Open plan file…" picker.
//
// Planr writes no magic header, so "looks like a plan" means what the writers
// always emit (utils/markdown.js, the JSON export of the plan object):
//   - Markdown: a `## Work Tree` heading;
//   - JSON: the top-level keys `meta` and `tree`.
// Anything else is somebody's note or config and stays out of the menu.

export const HEAD_BYTES = 8192;

const PLAN_NAME_RE = /\.planr\.(md|json)$/i;
const MD_MARKER_RE = /^##[ \t]+Work Tree[ \t]*$/m;
const JSON_KEY_RE = key => new RegExp(`^ {0,4}"${key}"[ \\t]*:`, 'm');
const JSON_META_RE = JSON_KEY_RE('meta');
const JSON_TREE_RE = JSON_KEY_RE('tree');

function hasMarker(extension, probe) {
  if (extension === 'md') {
    if (probe.headings) return probe.headings.some(h => /^Work Tree$/i.test(String(h).trim()));
    return MD_MARKER_RE.test(probe.head || '');
  }
  const head = probe.head || '';
  return JSON_META_RE.test(head) && JSON_TREE_RE.test(head);
}

/**
 * Is `file` a plan? `probe` is what is known about its start: `head` (the
 * first few KB of text) and/or `headings` (the metadata cache's heading
 * texts, which cover a whole note and need no read).
 */
export function isPlanLike(file, probe = {}) {
  const name = file?.name;
  // A folder has a name but no extension — and may be called "x.planr.md".
  if (typeof name !== 'string' || typeof file.extension !== 'string') return false;
  if (file.extension === 'planr' || PLAN_NAME_RE.test(name)) return true;
  if (file.extension !== 'md' && file.extension !== 'json') return false;
  return hasMarker(file.extension, probe || {});
}

/** The synchronous half of the probe: headings from the metadata cache. */
export function headingsOf(app, file) {
  const list = app.metadataCache?.getFileCache?.(file)?.headings;
  return list ? list.map(h => h.heading) : undefined;
}

async function readHead(app, file) {
  try {
    return (await app.vault.cachedRead(file)).slice(0, HEAD_BYTES);
  } catch {
    return '';
  }
}

async function probeOf(app, file) {
  if (file.extension === 'md') {
    const headings = headingsOf(app, file);
    if (headings) return { headings };
  }
  return { head: await readHead(app, file) };
}

/** Plans in the vault, `.planr.json` first, for the "Open plan file…" picker. */
export async function listPlanFiles(app) {
  const rank = f => (f.name.endsWith('.planr.json') ? 0 : f.extension === 'json' ? 1 : 2);
  const all = app.vault.getFiles();
  const flags = await Promise.all(all.map(async f => isPlanLike(f, PLAN_NAME_RE.test(f.name) ? {} : await probeOf(app, f))));
  return all.filter((_, i) => flags[i]).sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
}

/**
 * JSON has no metadata cache, and the `file-menu` callback cannot wait for a
 * read. So the answer is remembered per path: filled in the background
 * (`warm`, on layout ready and on every create/modify), read synchronously by
 * the menu. A path not read yet counts as "not a plan" and is queued.
 */
export function createJsonProbeCache(app) {
  const heads = new Map();
  const refresh = async file => {
    if (file?.extension !== 'json') return;
    heads.set(file.path, await readHead(app, file));
  };
  return {
    probe: file => ({ head: heads.get(file.path) }),
    has: file => heads.has(file.path),
    refresh,
    forget: path => heads.delete(path),
    warm: () => Promise.all(app.vault.getFiles().map(refresh)),
  };
}
