// Which vault files are offered to Planr: "Open in Planr" in the file menu and
// the "Open plan file…" picker.
//
// Planr writes no magic header, so "looks like a plan" means what the writers
// always emit (utils/markdown.js, the JSON export of the plan object):
//   - Markdown: a `Work Tree` heading, any level, any case;
//   - JSON: the top-level keys `meta` and `tree`. The writer orders keys
//     meta, teams, members, tree, so `tree` can lie far beyond the first KB of
//     a big plan — the whole file is judged, not its start.
// Anything else is somebody's note or config and stays out of the menu.

const PLAN_NAME_RE = /\.planr\.(md|json)$/i;
const MD_HEADING_RE = /^#{1,6}[ \t]+(.+?)[ \t#\r]*$/gm;

// Above this size a JSON file is not parsed, only scanned for the two keys.
const JSON_PARSE_CAP = 8 * 1024 * 1024;
const JSON_META_NEAR = 8192;
const JSON_KEY_RE = key => new RegExp(`^ {0,4}"${key}"[ \\t]*:`, 'm');
const JSON_META_RE = JSON_KEY_RE('meta');
const JSON_TREE_RE = JSON_KEY_RE('tree');

/** Concurrent vault reads, across the picker, the menu cache and the warm-up. */
export const READ_LIMIT = 8;

/** The one Markdown rule: is this heading text `Work Tree`? */
export function isWorkTreeHeading(title) {
  return /^Work Tree$/i.test(String(title).trim());
}

/** The same rule over raw Markdown text, for files the metadata cache has not indexed. */
function textHasWorkTree(text) {
  for (const m of String(text).matchAll(MD_HEADING_RE)) if (isWorkTreeHeading(m[1])) return true;
  return false;
}

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Does this JSON text have top-level `meta` and `tree`? */
export function jsonIsPlan(text) {
  const s = String(text);
  if (s.length > JSON_PARSE_CAP) return JSON_META_RE.test(s.slice(0, JSON_META_NEAR)) && JSON_TREE_RE.test(s);
  try {
    const data = JSON.parse(s);
    return isObject(data) && isObject(data.meta) && 'tree' in data;
  } catch {
    return false;
  }
}

function hasMarker(extension, probe) {
  if (typeof probe.plan === 'boolean') return probe.plan;
  if (extension === 'md') {
    if (probe.headings) return probe.headings.some(isWorkTreeHeading);
    return textHasWorkTree(probe.text || '');
  }
  return jsonIsPlan(probe.text || '');
}

/**
 * Is `file` a plan? `probe` is what is known about its content: `text` (the
 * file's text), `headings` (the metadata cache's heading texts, which need no
 * read) or `plan` (a verdict reached earlier).
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

const caches = new WeakMap();

/**
 * What is known about every file that needs a read to be judged, one cache per
 * app so the picker and the file menu ask the vault once. JSON has no metadata
 * cache and the `file-menu` callback cannot wait, so the answer is remembered
 * per path: filled in the background (`warm` on layout ready, `refresh` on
 * every create/modify) and read synchronously by `probe`. A path not read yet
 * counts as "not a plan" for that one call, and `probe` queues its read.
 */
export function probeCacheOf(app) {
  if (!caches.has(app)) caches.set(app, createProbeCache(app));
  return caches.get(app);
}

function createProbeCache(app) {
  const known = new Map(); // path -> is a plan
  const pending = new Map(); // path -> read in flight
  const waiting = [];
  let active = 0;

  const slot = async () => {
    if (active >= READ_LIMIT) await new Promise(resolve => waiting.push(resolve));
    active++;
  };
  const release = () => {
    active--;
    waiting.shift()?.();
  };
  const read = async file => {
    await slot();
    let text = '';
    try {
      text = await app.vault.cachedRead(file);
    } catch {
      // Unreadable counts as "not a plan".
    }
    release();
    known.set(file.path, file.extension === 'md' ? textHasWorkTree(text) : jsonIsPlan(text));
  };
  const ensure = file => {
    if (known.has(file.path)) return Promise.resolve();
    if (!pending.has(file.path))
      pending.set(
        file.path,
        read(file).finally(() => pending.delete(file.path)),
      );
    return pending.get(file.path);
  };

  const ensureAll = files => Promise.all(files.map(ensure));

  return {
    probe(file) {
      if (known.has(file.path)) return { plan: known.get(file.path) };
      ensure(file);
      return {};
    },
    /** Read what is not known yet, at most READ_LIMIT files at a time. */
    ensureAll,
    /** A changed file: JSON is judged again, Markdown is forgotten until asked for. */
    refresh: async file => {
      if (file?.extension === 'json') await read(file);
      else if (file?.path) known.delete(file.path);
    },
    forget: path => known.delete(path),
    warm: () => ensureAll(app.vault.getFiles().filter(f => f.extension === 'json' && !isPlanLike(f))),
  };
}

/**
 * Synchronous verdict for one file: its name, else the metadata cache's
 * headings, else the read cache (which queues a read for an unknown file).
 */
export function isPlanNow(app, file) {
  if (isPlanLike(file)) return true;
  if (file.extension === 'md') {
    const headings = headingsOf(app, file);
    if (headings) return isPlanLike(file, { headings });
  }
  if (file.extension !== 'md' && file.extension !== 'json') return false;
  return isPlanLike(file, probeCacheOf(app).probe(file));
}

/** Plans in the vault, `.planr.json` first, for the "Open plan file…" picker. */
export async function listPlanFiles(app) {
  const rank = f => (f.name.endsWith('.planr.json') ? 0 : f.extension === 'json' ? 1 : 2);
  const all = app.vault.getFiles();
  const unsure = all.filter(f => !isPlanLike(f) && (f.extension === 'json' || (f.extension === 'md' && !headingsOf(app, f))));
  await probeCacheOf(app).ensureAll(unsure);
  return all.filter(f => isPlanNow(app, f)).sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
}
