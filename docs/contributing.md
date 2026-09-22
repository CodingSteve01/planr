# Contributing

Planr is primarily a single-author project at the moment, but the code is structured for outside contributions. If you want to add a feature or fix a bug, here's the workflow.

## Setup

```bash
git clone https://github.com/CodingSteve01/planr planr
cd planr
npm install
npm run dev
```

That's it. No toolchain beyond Node and npm.

## Dev loop

- Edit a file → Vite HMR picks it up instantly
- No build step needed for development
- Manual QA in the browser is the test suite

**Do not start a second Vite dev server** if one is already running — it'll fight for the port. Either reuse the running one or stop it first.

## Code style

- **Terse JSX, minimal verbosity.** Functional components only. No class components.
- **Hooks only** — `useState`, `useMemo`, `useEffect`, `useRef`. No external state libraries.
- **ES modules** — `import` / `export`. No CommonJS.
- **No TypeScript.** Field shapes live in [docs/data-model.md](data-model.md) — treat it as the contract.
- **No PropTypes.** Destructure props at the top of each component.
- **Module size target: &lt; 400 LOC.** Split when a file grows past that.
- **Functional `setState` updaters in all mutation callbacks** — prevents stale-closure overwrites.
- **Only add comments where logic isn't self-evident.** Don't narrate what the code already says.
- **No speculative generality** — no config hooks for hypothetical future requirements.

## Making a change

1. Fork the repo
2. Branch from `main`: `git checkout -b feature/my-change`
3. Make the change — keep the diff tight
4. Test in the browser across Tree, Gantt, Network, Summary, and Resources views
5. Commit with a clear message describing **why**, not just **what**
6. Open a PR against `main`

### Commit message style

Recent project convention (`git log` shows the shape):

```
feat: Enhance file synchronization handling and improve GanttView performance with useMemo
```

Prefix: `feat:`, `fix:`, `refactor:`, `docs:`, `style:` — conventional commits style.

## Testing philosophy

```bash
npm run lint    # no-undef, and nothing else — see eslint.config.js for why
npm test        # ~850 tests
```

(This section said "No automated tests" until September 2026, on the grounds
that the app is visual and small. Both stopped being true.)

Two things are worth knowing about where the tests can and cannot see.

**A view's own smoke test does not prove the app passes it the right props.**
`views.smoke.test.jsx` mounts each view with hand-written props; `App.jsx`
decides what they actually get. That gap is not theoretical: two handlers were
deleted from App by a careless region replacement, the build was fine, 849
tests passed, and the plugin went white the moment anybody opened the Planning
tab. `everyTab.app.test.jsx` walks every tab in the real App for exactly that
reason, and it is derived from `TAB_IDS`, so a new view is covered by existing
it.

**`no-undef` catches what no test can cheaply.** An identifier that no longer
exists throws only when React renders the one component that uses it. There is
no test suite shape that makes that reliably visible; a linter sees it before
the file is saved. That is why the lint config has one rule and runs in CI
ahead of the tests. More rules can be earned later, one at a time, each with a
reason — `react-hooks/rules-of-hooks` is off and should not stay off (it
reports 12 real violations that predate the config).

When a change is about behaviour rather than structure, write the test first
and **watch it fail for the right reason**. A test added green proves the
assertion runs, not that it would have caught anything.

When you submit a change, describe how you verified it:

- "Loaded my sample project, ran through the Wizard's flow, confirmed no regressions in Gantt and Network views"
- "Reproduced bug at step X, applied fix, re-ran, bug is gone"

## Architecture notes before big changes

Read [architecture.md](architecture.md). Key constraints:

- **No backend.** Every feature must run client-side.
- **File System Access API** is nice-to-have, not required — `localStorage` is always the fallback.
- **No rewrites of the scheduler without a migration story** — project files in the wild depend on its behavior.

## Feature areas

- **Scheduler changes** → read [scheduler.md](scheduler.md) first. The algorithm is small but subtle (team slots, pinned starts, inherited deps).
- **Gantt changes** → read [gantt.md](gantt.md). Dependency routing and hover logic have non-obvious edge cases.
- **Network graph changes** → read [network-graph.md](network-graph.md). The layout was iterated on many times; don't undo optimization without a reason.
- **Import/export changes** → read [import-export.md](import-export.md). Round-trip fidelity is a real constraint.

## Internationalization (i18n) workflow

All user-facing strings go through the `useT()` hook from `src/i18n.jsx`. When adding or modifying any visible text:

1. Add a key to the translations object in `src/i18n.jsx`
2. Provide **both** an English and a German value
3. Use `t('your.key')` in the component instead of a raw string

There are ~350 keys currently. The convention is dot-separated namespaces (e.g. `gantt.zoom`, `settings.language`, `review.decisions`). "Auto" language follows `navigator.language`.

## Licensing

MIT. Contributions are accepted under the same license.
