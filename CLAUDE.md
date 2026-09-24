# Planr

Offline-first project planner (React 18 + Vite, plain JS/JSX, no TypeScript),
also shipped as an Obsidian plugin (`obsidian/`). Architecture and the why
behind decisions live in `docs/` — read the relevant file there before
changing a subsystem, instead of reconstructing it from the code.

## Commands

- Tests: `npx vitest run` — in a worktree (`.claude/worktrees/*`) use
  `npx vitest run -c vitest.worktree.config.js`, the default config's
  `fs.allow` rejects worktree paths. A single file: append its path.
- Lint: `npx eslint <file>` (a PostToolUse hook already lints every edited
  JS/JSX file and reports errors back).
- Plugin into the vault: `node obsidian/install.mjs "<vault path>"`.
- Version: `node scripts/version.mjs <x.y.z>` — keeps package.json,
  manifest.json and versions.json in step. PRs touching `src/`/`obsidian/`
  get a patch bump from CI — wait for that commit (`gh run list --workflow
  version-bump.yml`) before merging, or the release is skipped. When merging
  several PRs, merge `main` into each next one and set the version one
  higher by hand.

## Rules

- **Never start the dev server** (`npm run dev`, `vite`, `vite preview`). The
  owner runs it. Verify with tests, or build the plugin into the vault.
- Every change ships with tests, updated `docs/`, a commit and a push. Merge
  only when asked.
- Code comments and tests in English; UI strings in both languages in
  `src/i18n.jsx`.
- Colours only as tokens in the two palette blocks of `src/App.css`;
  `paletteContrast.test.js` holds text to 7:1 (`--tx`/`--tx2`) and 6:1
  (`--tx3`). No HTML text below 10px. See `docs/design-tokens.md`.
- Before renaming a symbol used in more than one file, find its references
  with the LSP tool rather than grep.
