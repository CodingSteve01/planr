# Obsidian plugin

Planr runs inside Obsidian as a plugin: the full app in a workspace tab, with
its plan files living in the vault instead of somewhere on disk. Obsidian Sync
carries them to your other machines, notes can link to them, and the plan sits
next to the meeting notes it came out of.

It is the same app, not a port. `obsidian/src/main.jsx` imports `src/App.jsx`
and mounts it into a leaf; everything else in `obsidian/` exists to make the
app's two host assumptions — "I own the page" and "files come from the File
System Access API" — true again inside Obsidian.

Desktop only. Planr is built for large screens and a keyboard, and the plugin
inherits that (`isDesktopOnly: true` in the manifest).

## Install

Step-by-step instructions live in the [README](../README.md#or-run-it-in-obsidian)
— that is the page someone reads before they have cloned anything. In short:

- **BRAT** (recommended): install *Obsidian42 - BRAT* from the community
  plugins list, run **BRAT: Add a beta plugin for testing**, paste
  `CodingSteve01/planr`. It keeps the plugin updated from then on.
- **By hand**: `main.js`, `manifest.json` and `styles.css` from the
  [latest release](https://github.com/CodingSteve01/planr/releases/latest) into
  `<vault>/.obsidian/plugins/planr/`.
- **From this checkout**: `npm run obsidian:install -- "/path/to/Vault"` builds
  straight into a vault and remembers the path (`--dev` for an unminified
  build with an inline sourcemap). Obsidian picks up a new build after *Reload
  app without saving* (`Ctrl/Cmd+R`) or toggling the plugin off and on.

`npm run obsidian:install` writes the vault path to `obsidian/.vault-path`, and
this checkout carries three git hooks that rebuild into that vault whenever
something the plugin contains has changed — on `post-commit`, `post-checkout`
and `post-merge`. They live in `.git/hooks`, are never committed, and run on
one machine only. For a while only the last two existed, so a run of commits on
one branch left the vault on whatever the previous branch switch had built,
which reads as "it updates itself" right up until it does not. Either way the
vault only changes when a build succeeds: a failed build leaves the previous
one in place and says so.

## Using it

A Planr tab is an editor tab: one tab, one plan, as many at once as you like.
Open three plans and you get three tabs, each named after its plan; switch
between them, split the pane and put two side by side, close one and the others
carry on. The workspace remembers them, so a restart reopens the same plans in
the same places.

- **Click a `*.planr.md` file** — it opens in Planr, not in the Markdown
  editor, and the Markdown editor is never built on the way there. Only files
  named `…planr.md` are touched, the tab menu always offers **Open as
  Markdown**, and *Settings → Planr* turns the whole behaviour off.
- **Click a `*.planr` file** — opens in Planr too, via a proper extension
  registration. `.planr` is nobody else's, and without the registration
  Obsidian would not even list such a file in the explorer.
- **Ribbon icon** or the command **Planr: Open plan file…** — fuzzy-search the
  vault for a plan and open it in a new tab.
- **Right-click any plan file → Open in Planr** — same thing from the file
  explorer, and the way in for a `.planr.json`.
- **Save as…** inside the app moves the document; the tab follows it to the new
  file without reloading what you were doing.

The tab is named after the plan, so Planr's own header does not repeat the file
name inside a host — the project's name and the save state are what is left
there.

`.md` itself is deliberately **not** registered: that would take every note in
the vault away from Obsidian's own editor. The `.planr.md` swap is a targeted
substitute — same convenience, no collateral.

Inside the app, everything works as on the web. `Cmd/Ctrl+S`, *Save as…* and
*Open* go through Obsidian: the open dialog is a vault fuzzy-finder, and saving
asks for a vault-relative path instead of an OS file dialog. Auto-save,
external-change detection and the snapshot ring are unchanged — a plan edited
by Obsidian Sync on another machine shows up as an external change, exactly as
a plan edited by another app does on the web.

Two file formats, same as always: `*.planr.json` keeps everything and is the
safe default, `*.md` stays readable as a note (and loses what the Markdown
writer does not carry — see [import-export.md](import-export.md)).

## How it works

| Concern | Web | Plugin |
| --- | --- | --- |
| Mount point | `#root` in `index.html` | a container inside a `FileView`, one per open plan |
| Stylesheet | `src/App.css`, page-wide | same file, scoped to `.planr-view` at build time |
| Open / save | File System Access API | vault pickers, swapped in at build time |
| Which file is open | `FileSystemFileHandle` in IndexedDB | the leaf's own file, restored with the workspace |
| UI preferences | `localStorage` | `localStorage` (unchanged — Obsidian's renderer has one) |
| Theme "Auto" | OS `prefers-color-scheme` | the vault's light/dark setting |
| Neutral colours | Planr's own palette | the vault theme's (`--background-*`, `--text-*`, `--interactive-accent`), see below |
| Exports (PDF, DOCX, CSV…) | browser download | browser download (Electron's save dialog) |

Four files carry all of it:

- **`obsidian/src/main.jsx`** — the `Plugin` and the `FileView`. Mounts one
  React tree per open plan, registers the ribbon icon, the command and the
  file-menu entry, redirects a plan note away from the Markdown editor, and
  hands each view the container its own modals and dropdowns portal into.

  The app sizes itself to its container, not to the window. `.app` asked for
  `height: 100vh`, and a workspace leaf is not the viewport — inside a pane
  shorter than the window the app stood taller than the box holding it, so the
  pane scrolled and the view inside it scrolled too: two scrollbars for one
  list. `html`, `body` and `#root` are all `height: 100%` in the same
  stylesheet, so `100%` is identical on the web and correct in a host.

  `canAcceptExtension` answers for `.planr` and nothing else. Obsidian keeps
  the current view whenever it can accept the new file's extension, so while
  this also answered yes to `md` and `json`, opening an ordinary note with a
  plan in focus loaded that note *into the plan's tab*. The other two ways in
  do not need it: a `.planr.md` is redirected in `patchLeafViewState`, which
  rewrites the requested type before the leaf acts on it, and a `.json` plan
  arrives through "Open in Planr" — both name the view type themselves.
- **`obsidian/src/vaultFs.js`** — the file pickers and the handle objects they
  return, implemented on `app.vault`.
- **`obsidian/src/filePickers.js`** and **`obsidian/src/fileHandleStore.js`** —
  build-time replacements for the two modules in `src/utils/` that answer
  "where does a file come from" and "how is the open one remembered". The
  second answers "nothing remembered": the view is handed its file by
  Obsidian, so there is no global mount to restore. The alternative to the
  first, patching `window.showOpenFilePicker`, would change what every other
  plugin in the app sees; "we put it back on unload" is not an argument, it is
  a promise.
- **`obsidian/scope-css.mjs`** — rewrites every selector in `App.css` so it
  cannot reach past `.planr-view`, and trades `100vh` for `100%` because a leaf
  is not the window. `obsidian/__tests__/scopeCss.test.js` asserts that nothing
  escapes; that test is the guard rail against a build that restyles someone's
  whole vault.

On the app side there are two seams. `src/utils/embedHost.js` is the surface a
host may influence: the vault's theme, announced globally on
`window.__planrHost` because one vault has one appearance, and the container a
view's popups portal into, which is **not** global and travels down the React
tree as `PortalRootContext`. A global pointer was the first attempt and it is
worth remembering why it failed: every newly mounted view overwrote it, so the
dropdown you clicked rendered into another tab's DOM, where it is invisible —
an input with nothing behind it. Popups stay inside the scoped stylesheet
either way, because the container is where the design tokens live.

The second seam is `App`'s two optional props. `mount` is the handle the host
hands it; `onFileChange` is how the app reports a Save As back so the tab can
follow. An app with those props keeps nothing in the shared localStorage
snapshot either — two plans open at once would otherwise overwrite each
other's, and whichever typed last would be what came back.

### Why a plan note does not flash the Markdown editor first

`.planr.md` is a note as far as Obsidian is concerned: its extension is `md`,
and registering that would take every note in the vault away from Obsidian's
own editor. The obvious way round it — listen for `file-open`, swap the leaf
afterwards — is what this replaces, and it is why switching between plan tabs
used to show raw Markdown for a beat: by the time the event fires the Markdown
editor is built and painted.

So the *request* is rewritten instead. `WorkspaceLeaf.prototype.setViewState`
is patched, and a leaf about to open a plan note as Markdown is told to open a
Planr view — before it builds anything. The Markdown view never exists. This
is the approach the Kanban and Excalidraw plugins take, for the same reason.
`fileModes` keeps the one answer the patch has to respect: a tab where you
chose **Open as Markdown** stays Markdown, until it moves on to another note.
On unload the patch is handed back, unless another plugin patched on top in the
meantime — that chain is theirs now.

### Why the vault's own form styling has to be pushed back

Obsidian styles bare `input`, `select`, `textarea` and `button` globally —
background, border, height, box-shadow — so the handful of unclassed controls
inside Planr would otherwise render as Obsidian widgets in the middle of a
Planr panel. `obsidian/src/obsidian.css` neutralises that inside `.planr-view`.

The blunt version of that reset caused a visible bug: `height: auto` on every
input also hit `input[type=checkbox]`. Obsidian does not style a checkbox, it
**replaces** it — `appearance: none` plus an explicit width and height — so
taking the height away left a thin coloured bar where a checkbox should be.
Half of someone else's widget is worse than either whole one, so checkboxes and
radios now get the native control back explicitly (`appearance: auto`, no
border, no background, and `content: none` on both pseudo-elements, which is
where the vault draws its tick). Pinned in
[`obsidian/__tests__/bundle.test.js`](../obsidian/__tests__/bundle.test.js),
against the built stylesheet rather than the source.

### Colours come from the vault theme

Following the vault's light/dark choice is not enough to look at home: Planr's
warm near-black next to Atom's blue-grey reads as a web page framed inside the
vault. So `obsidian/src/obsidian.css` re-points Planr's **neutral** tokens at
the theme's variables — and only the neutrals. Status (green/amber/red), team
colours, critical path, diff and the confidence ramp keep Planr's values; they
carry meaning a theme knows nothing about.

| Planr token | From the vault |
| --- | --- |
| `--bg` (`--surf0`) | `--background-primary` |
| `--bg2` (`--surf1`) | `--background-secondary` |
| `--bg3` / `--bg4` / `--bg5` | `--text-normal` mixed 5 / 10 / 16 % into `--background-primary` |
| `--b` | `--background-modifier-border` |
| `--b2` / `--b3` | `--text-normal` mixed 15 / 30 % into the border |
| `--tx` | `--text-normal` |
| `--tx2` / `--tx3` | `--text-muted` 35 / 55 %, rest `--text-normal` |
| `--ac2` (fills) | `--interactive-accent` |
| `--ac` (links, focus, text) | `--interactive-accent` 55 %, rest `--text-normal` |
| `--on-ac` | `--text-on-accent` |
| `--ac-soft`, `--st-*-soft`, `--bg-done` | Planr's tint over `--background-primary` |

Three decisions in that table came out of measuring against Atom rather than
from the variable names:

- **Theme text colours are not good enough for 10–11px labels.** Atom's
  `--text-muted` is 3.5:1 on its own ground in dark and 2.7:1 in light;
  `--text-faint` is 1.7:1 / 2.4:1. So the secondary inks are the muted colour
  pulled towards `--text-normal`, and `--text-faint` is not used at all.
- **`--interactive-accent` is a fill colour.** As text it is 2.6:1 on Atom dark
  with this vault's rust accent, so only `--ac2` takes it as-is.
- **`--background-modifier-hover` is translucent**, and `--bg3` also paints
  sticky columns that content scrolls under — so the steps above the ground
  are opaque mixes instead.

The done node's green (`--bg-done`) is kept at 6 %: Planr's risk red is only
just 4.5:1 on Atom's dark ground, and the node carries red priority glyphs.

The mapping applies only when Planr's theme and the vault's agree
(`html[data-theme="dark"] body.theme-dark .planr-view`, and the light twin).
With Planr on **Auto** they always do; someone who picks *Light* inside a dark
vault gets Planr's full light palette instead of dark vault surfaces under
light status colours. The selector's specificity also has to beat the scoped
light block (`html[data-theme="light"] .planr-view`).

[`obsidian/__tests__/vaultPalette.test.js`](../obsidian/__tests__/vaultPalette.test.js)
evaluates every mix against Atom (with its own accent and with this vault's)
and Obsidian's default theme, in both modes, to the same AA bars as
[`paletteContrast.test.js`](../src/utils/__tests__/paletteContrast.test.js).
[`bundle.test.js`](../obsidian/__tests__/bundle.test.js) checks the rule is
present in the built `styles.css`. A theme with other values can still fall
short; adding it is one more fixture in that test.

### Build

```bash
npm run build:obsidian          # → dist-obsidian/{main.js,manifest.json,styles.css}
```

esbuild, not Vite — Obsidian wants a single CommonJS bundle it can `require()`,
so dynamic imports get inlined and there is no code splitting. Two Vite-isms
are handled in `obsidian/esbuild.config.mjs`: the `?url` asset import in
`src/utils/exports.js` becomes an inlined blob URL, and `fileHandleStore.js`
resolves to the vault version.

`main.js` is around 4.5 MB, most of it the `html-to-docx` browser bundle and
pdfmake. That is a local file in a plugin folder, not a page load, so it is
paid once at plugin startup.

## Release

The release is a consequence of the version changing, not a separate ritual —
and the version changes by itself. A pull request that touches `src/` or
`obsidian/` gets a patch bump pushed onto its own branch by
[`version-bump.yml`](../.github/workflows/version-bump.yml), so merging it
carries the bump to main and the release follows. Nobody has to remember, and
nobody on BRAT sits on the version from before the last five changes — which is
what had happened, five merged PRs deep, at 1.0.2.

On the PR branch rather than on main, deliberately: main is protected, and a
workflow pushing to it would need a bypass or an admin token, which is not a
thing to hand a CI job for a convenience. The bump is visible in the diff
before it lands.

A minor or major release is still a decision, so it stays manual — set it in
the PR and the bump stands down, because it only runs when the version has not
already moved:

```bash
npm run version:set 1.1.0
```

That writes the version into `package.json`, `manifest.json` and
`versions.json` (which maps plugin version → minimum Obsidian version) in one
go. Commit it, merge it to main, and
[`.github/workflows/obsidian-plugin.yml`](../.github/workflows/obsidian-plugin.yml)
does the rest: checks the three files agree, runs the tests, builds, tags, and
publishes `main.js`, `manifest.json` and `styles.css` as individual release
assets — Obsidian does not accept a zip. The tag name **is** the version, with
no `v` prefix, which is what Obsidian's installer and BRAT look for.

Running it again is harmless: a version that already has a release is skipped,
so re-running the workflow or touching `manifest.json` for another reason
republishes nothing.

### Why not release-please

release-please decides *what* to release by reading Conventional Commits —
`feat:`, `fix:`, `chore:`. This repository writes commit messages as prose
("Keep the cursor on screen when it moves"), so release-please would sit there
proposing nothing until every subject line grew a machine-readable prefix.
That is a trade: a changelog generated for you, against the commit log being
written for people. The version-bump trigger above buys the same thing that
actually mattered here — never tagging by hand, never a tag that disagrees
with the manifest — without the tax. If the prefixes ever become worth it,
release-please slots in where this workflow sits.

## Built to the guidelines anyway

Obsidian's plugin guidelines are a decent description of "does not surprise the
app it lives in", so the plugin follows them whether or not anyone reviews it.
The three that took actual work:

- **No `innerHTML` reaches the page.** Tooltips used to be HTML strings handed
  to `innerHTML`, escaped by hand on the way in. They are text now, in a
  dialect of three symbols (`**bold**`, `__muted__`, a newline, `- ` for a
  detail line) parsed in [`src/utils/tipText.js`](../src/utils/tipText.js) and
  rendered as elements. The roadmap's richer tooltips travel as JSON in
  `data-tip` and are rendered with the app's own components; generated markup
  goes in through `DOMParser` — into an inert document, adopted node by node —
  rather than as a string. What is left is `src/utils/exports.js`, which builds
  a detached document for the Word export and never attaches it to the page.

  One trap, paid for once: `renderRoadmapSvg` returns *two* documents in one
  string — the map, and then an HTML legend as its sibling. Parsed as
  `image/svg+xml`, which accepts a single root element, that legend is "extra
  content at the end of the document": the whole parse fails, and a failed XML
  parse is a document rather than a throw, so the Subway-Map simply was not
  there, without a word in the console. `splitSvgMarkup` in
  [`src/utils/roadmap.js`](../src/utils/roadmap.js) separates the two now, and
  each half is parsed in its own mode.
- **No browser global is patched.** The file pickers are a module the build
  swaps, not a redefined `window.showSaveFilePicker` — a plugin that redefines
  a browser global changes what every other plugin in the app sees.
- **Nothing is detached in `onunload`**, and the plugin has no `onunload` left
  to do it in.

## The community directory, and why Planr is not in it

Not submitted — deliberately.

The route also changed while this was being built: `obsidianmd/obsidian-releases`
has pull requests disabled now, and submissions go through a portal at
[community.obsidian.md](https://community.obsidian.md), where you sign in with
an Obsidian account, link GitHub to prove you own the repo, and hand the plugin
to an automated review that sends findings back for another release round.

That machinery exists so strangers can find a plugin. Planr is installed by
people who were pointed at it, and BRAT gives them one-line installs and
automatic updates without any of it.

Nothing about the plugin depends on that decision: the manifest, the release
layout and the guideline work above are what a submission needs, so should it
ever be worth it, the remaining step is the portal itself. Requirements as of
this writing:

- `manifest.json` in the repository root, on the default branch, with the
  version of the release being submitted (the directory reads the manifest at
  HEAD).
- A release tagged exactly that version, no `v` prefix, carrying `main.js`,
  `manifest.json` and `styles.css` as individual assets — not a zip.
- A README that describes the plugin, and a licence.

All three hold today, and the release workflow keeps them holding.

## Limitations

- **Desktop only.** No mobile build; the app assumes a wide window and a
  keyboard.
- **Exports go through the browser download path**, so a PDF or DOCX lands
  wherever Electron's save dialog points, not in the vault.
- **Obsidian does not render a plan `.md` the way Planr writes it.** It is a
  valid note, but the tables and bullet structure are Planr's format — edit it
  in Planr, read it anywhere.
- **UI preferences are shared by every tab.** Scale, language, which tab was
  last open: they live in `localStorage`, one set per vault, and a new Planr
  tab starts from them. Per-plan preferences would have to live in the plan.
- **`WorkspaceLeaf.prototype.setViewState` is patched.** There is no supported
  hook for "open this `.md` in my view", so the plugin patches the workspace
  prototype like Kanban and Excalidraw do. It is narrow — plan notes only, one
  rewritten field — and put back on unload, but it is a patch on Obsidian's
  internals and an Obsidian update could move it.
