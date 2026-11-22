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
// Obsidian keeps the extension as written; `Plan.MD` is still Markdown.
const extOf = f => (typeof f?.extension === 'string' ? f.extension.toLowerCase() : '');
const MD_HEADING_RE = /^#{1,6}[ \t]+(.+?)[ \t#\r]*$/gm;

// Above this size a JSON file is not parsed, only scanned for the two keys.
const JSON_PARSE_CAP = 8 * 1024 * 1024;
const JSON_META_NEAR = 8192;
// The indent of the first key line after the opening `{` is the top-level
// indent (two spaces from the writer, but a reformat may use tabs or four).
// A key counts only at exactly that indent, so a nested `tree` never matches.
// A file without such a line is compact one-line JSON and is not offered.
const JSON_INDENT_RE = /^\s*\{[ \t]*\r?\n([ \t]*)"/;
const keyAt = (indent, key) => new RegExp(`^${indent}"${key}"[ \\t]*:`, 'm');

function scanTopLevelKeys(head, s) {
  const indent = JSON_INDENT_RE.exec(head)?.[1];
  if (indent === undefined) return false;
  return keyAt(indent, 'meta').test(head) && keyAt(indent, 'tree').test(s);
}

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

function parsedIsPlan(s) {
  try {
    const data = JSON.parse(s);
    return isObject(data) && isObject(data.meta) && 'tree' in data;
  } catch {
    return false;
  }
}

/**
 * Does this JSON text have top-level `meta` and `tree`? The writer puts `meta`
 * first, so a head without the word is no plan and costs no parse (every
 * autosave of any JSON asks). Otherwise the file is parsed; above the cap it is
 * never parsed, only scanned for the two top-level keys.
 */
export function jsonIsPlan(text) {
  const s = String(text);
  const head = s.slice(0, JSON_META_NEAR);
  if (!head.includes('"meta"')) return false;
  if (s.length <= JSON_PARSE_CAP) return parsedIsPlan(s);
  return scanTopLevelKeys(head, s);
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
  if (extOf(file) === 'planr' || PLAN_NAME_RE.test(name)) return true;
  if (extOf(file) !== 'md' && extOf(file) !== 'json') return false;
  return hasMarker(extOf(file), probe || {});
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
  const pending = new Map(); // path -> the newest read in flight
  const newest = new Map(); // path -> generation of the read allowed to write
  const waiting = [];
  let active = 0;
  let sequence = 0;

  // A waiter is handed the slot as it is: `active` stays raised until nobody waits.
  const slot = async () => {
    if (active < READ_LIMIT) {
      active++;
      return;
    }
    await new Promise(resolve => waiting.push(resolve));
  };
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };
  // Whatever read is running for `path` now loses the right to write.
  const supersede = path => {
    newest.set(path, ++sequence);
    return sequence;
  };
  const read = async (file, generation) => {
    await slot();
    let text = '';
    try {
      text = await app.vault.cachedRead(file);
    } catch {
      // Unreadable counts as "not a plan".
    }
    release();
    // Generations are unique, so a missing entry never equals a running read's.
    if (newest.get(file.path) !== generation) return;
    newest.delete(file.path);
    known.set(file.path, extOf(file) === 'md' ? textHasWorkTree(text) : jsonIsPlan(text));
  };
  // Every read goes through here, so `pending` always holds the newest one.
  const start = file => {
    const { path } = file;
    const run = read(file, supersede(path)).finally(() => {
      if (pending.get(path) === run) pending.delete(path);
    });
    pending.set(path, run);
    return run;
  };
  const ensure = file => {
    if (known.has(file.path)) return Promise.resolve();
    return pending.get(file.path) ?? start(file);
  };
  const forget = path => {
    newest.delete(path); // a running read finds no matching generation and is discarded
    pending.delete(path);
    return known.delete(path);
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
      if (extOf(file) === 'json') await start(file);
      else if (file?.path) forget(file.path);
    },
    forget,
    /** Paths with a generation entry; a test hook for the bookkeeping. */
    trackedPaths: () => newest.size,
    warm: () => ensureAll(app.vault.getFiles().filter(f => extOf(f) === 'json' && !isPlanLike(f))),
  };
}

/**
 * Synchronous verdict for one file: its name, else the metadata cache's
 * headings, else the read cache (which queues a read for an unknown file).
 */
export function isPlanNow(app, file) {
  if (isPlanLike(file)) return true;
  if (extOf(file) === 'md') {
    const headings = headingsOf(app, file);
    if (headings) return isPlanLike(file, { headings });
  }
  if (extOf(file) !== 'md' && extOf(file) !== 'json') return false;
  return isPlanLike(file, probeCacheOf(app).probe(file));
}

/** Plans in the vault, `.planr.json` and `.planr` first, for the "Open plan file…" picker. */
export async function listPlanFiles(app) {
  const rank = f => (/\.planr\.json$/i.test(f.name) || extOf(f) === 'planr' ? 0 : extOf(f) === 'json' ? 1 : 2);
  const all = app.vault.getFiles();
  const unsure = all.filter(f => !isPlanLike(f) && (extOf(f) === 'json' || (extOf(f) === 'md' && !headingsOf(app, f))));
  await probeCacheOf(app).ensureAll(unsure);
  return all.filter(f => isPlanNow(app, f)).sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
}
