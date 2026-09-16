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

### From the community plugin list

Not there yet — see [Getting into the community store](#getting-into-the-community-store).

### With BRAT (the unofficial route)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) installs plugins straight
from a GitHub repository and keeps them updated, no review needed:

1. Install **Obsidian42 - BRAT** from the community plugins list.
2. *BRAT → Add a beta plugin for testing* → `CodingSteve01/planr`.
3. Enable **Planr** under *Settings → Community plugins*.

BRAT reads the latest GitHub release, so anything the release workflow
publishes is immediately installable.

### By hand

Download `main.js`, `manifest.json` and `styles.css` from a
[release](https://github.com/CodingSteve01/planr/releases) into
`<vault>/.obsidian/plugins/planr/`, then enable the plugin.

### From this checkout

```bash
npm run obsidian:install -- "/path/to/Vault"
```

Builds straight into `<vault>/.obsidian/plugins/planr/` and remembers the vault
path for next time (`npm run obsidian:install` afterwards). Add `--dev` for an
unminified build with an inline sourcemap. Obsidian picks up a new build after
*Reload app without saving* (`Ctrl/Cmd+R`) or toggling the plugin off and on.

## Using it

- **Click a `*.planr.md` file** — it opens in Planr, not in the Markdown
  editor. Obsidian reads that file's extension as `md` and hands it to the
  editor first; the plugin swaps the view right after. Only files named
  `…planr.md` are touched, the tab menu always offers **Open as Markdown**, and
  *Settings → Planr* turns the whole behaviour off.
- **Click a `*.planr` file** — opens in Planr too, via a proper extension
  registration. `.planr` is nobody else's, and without the registration
  Obsidian would not even list such a file in the explorer.
- **Ribbon icon** or the command **Planr: Open Planr** — opens the app in a tab.
- **Planr: Open plan file…** — fuzzy-search the vault for a plan and mount it.
- **Right-click any plan file → Open in Planr** — same thing from the file
  explorer, and the way in for a `.planr.json`.

A Planr tab remembers which plan it holds, so it comes back pointing at the
same file after a restart, and the tab is named after the plan rather than
"Planr".

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
| Mount point | `#root` in `index.html` | `contentEl` of an `ItemView` |
| Stylesheet | `src/App.css`, page-wide | same file, scoped to `.planr-view` at build time |
| Open / save | File System Access API | vault pickers, swapped in at build time |
| Remembered file | `FileSystemFileHandle` in IndexedDB | vault path in Obsidian's per-vault local storage |
| UI preferences | `localStorage` | `localStorage` (unchanged — Obsidian's renderer has one) |
| Theme "Auto" | OS `prefers-color-scheme` | the vault's light/dark setting |
| Exports (PDF, DOCX, CSV…) | browser download | browser download (Electron's save dialog) |

Four files carry all of it:

- **`obsidian/src/main.jsx`** — the `Plugin` and `ItemView`. Mounts React,
  registers the ribbon icon, the two commands and the file-menu entry, and
  points the app's portals at the view container so modals and dropdowns stay
  inside the scoped stylesheet.
- **`obsidian/src/vaultFs.js`** — the file pickers and the handle objects they
  return, implemented on `app.vault`.
- **`obsidian/src/filePickers.js`** and **`obsidian/src/fileHandleStore.js`** —
  build-time replacements for the two modules in `src/utils/` that answer
  "where does a file come from" and "how is the open one remembered". The
  alternative, patching `window.showOpenFilePicker`, would change what every
  other plugin in the app sees; "we put it back on unload" is not an argument,
  it is a promise.
- **`obsidian/scope-css.mjs`** — rewrites every selector in `App.css` so it
  cannot reach past `.planr-view`, and trades `100vh` for `100%` because a leaf
  is not the window. `obsidian/__tests__/scopeCss.test.js` asserts that nothing
  escapes; that test is the guard rail against a build that restyles someone's
  whole vault.

The only change on the app side is `src/utils/embedHost.js` — the surface a
host may influence — plus the three places that consult it: the two portal
call sites (`Phases.jsx`, `SearchSelect.jsx`) and `ThemeProvider` in
`i18n.jsx`. The plugin announces itself on `window.__planrHost` with the view
container and the vault's theme, so popups stay inside the scoped stylesheet
and "Auto" follows Obsidian instead of the OS underneath it.

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

Tags in this repository are plugin releases. The tag name **is** the version,
with no `v` prefix — that is what Obsidian's installer and BRAT look for.

1. Bump the version in `package.json`, `manifest.json` and `versions.json`
   (`versions.json` maps plugin version → minimum Obsidian version).
2. `git tag 1.1.0 && git push --tags`.

`.github/workflows/obsidian-plugin.yml` then runs the tests, builds, checks the
tag against `manifest.json` and publishes `main.js`, `manifest.json` and
`styles.css` as individual release assets — Obsidian does not accept a zip.

## Getting into the community store

The store is a single registry file. To get listed:

1. Have a public repo with `manifest.json` in the **root** (it is) and a
   release whose tag matches the manifest version (the workflow enforces that).
2. Add a `README.md` section describing the plugin and a `LICENSE` (both here).
3. Open a PR against
   [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
   adding an entry to `community-plugins.json`:

   ```json
   {
     "id": "planr",
     "name": "Planr",
     "author": "Steffen Lüling",
     "description": "Auto-scheduled project planning: work breakdown tree, critical path, Gantt and roadmap, on plan files in your vault.",
     "repo": "CodingSteve01/planr"
   }
   ```

4. A bot runs the automated checks, then a human reviews. Expect weeks, and
   expect review notes — the usual ones for a plugin like this are about
   `innerHTML` use, detaching leaves in `onunload`, and hard-coded styles that
   should be CSS variables.

Until then BRAT is the honest answer, and it is what most people testing a
plugin use anyway.

## Limitations

- **Desktop only.** No mobile build; the app assumes a wide window and a
  keyboard.
- **Exports go through the browser download path**, so a PDF or DOCX lands
  wherever Electron's save dialog points, not in the vault.
- **Obsidian does not render a plan `.md` the way Planr writes it.** It is a
  valid note, but the tables and bullet structure are Planr's format — edit it
  in Planr, read it anywhere.
- **One plan at a time.** The view mounts the file remembered as "mounted";
  opening a second plan replaces the first, as on the web.
- **A `.planr.md` swap is visible.** Obsidian opens the Markdown editor for a
  fraction of a second before the plugin takes the leaf over. Unavoidable
  without claiming `.md` wholesale.
