// Builds the Obsidian plugin: one CommonJS main.js, one styles.css, plus the
// manifest. Vite builds the web app; Obsidian wants a single bundle it can
// `require()`, so this is a second, much smaller pipeline over the same src/.
//
//   node obsidian/esbuild.config.mjs                  → dist-obsidian/
//   node obsidian/esbuild.config.mjs --out <dir>      → install into a vault
//
// Two things the app's Vite build does that esbuild has to be told about:
//   · `import … from '…?url'` — a Vite asset import. esbuild gets a loader
//     that inlines the file and hands back a blob URL, which is all the
//     consumer (a <script> injection) actually needs.
//   · src/utils/fileHandleStore.js and filePickers.js — swapped for the
//     vault-backed versions.

import { createRequire } from 'node:module';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { scopeCss } from './scope-css.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const require_ = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const outArg = argv.indexOf('--out');
const outDir = outArg === -1
  ? path.join(repo, 'dist-obsidian')
  : path.resolve(argv[outArg + 1]);

/** Vite's `?url` asset imports, as a blob URL baked into the bundle. */
const viteUrlImports = {
  name: 'vite-url-imports',
  setup(build) {
    build.onResolve({ filter: /\?url$/ }, args => {
      const spec = args.path.slice(0, -'?url'.length);
      const resolved = spec.startsWith('.')
        ? path.resolve(args.resolveDir, spec)
        : require_.resolve(spec, { paths: [repo] });
      return { path: resolved, namespace: 'vite-url' };
    });
    build.onLoad({ filter: /.*/, namespace: 'vite-url' }, async args => {
      const source = await readFile(args.path, 'utf8');
      return {
        contents: `export default URL.createObjectURL(new Blob([${JSON.stringify(source)}], { type: 'text/javascript' }));`,
        loader: 'js',
      };
    });
  },
};

/**
 * The two modules the vault answers differently: where a file comes from
 * (filePickers) and how the open one is remembered (fileHandleStore). The
 * alternative — patching `window.showOpenFilePicker` — would change what
 * every other plugin in the app sees, so the substitution happens here.
 */
const vaultModules = {
  name: 'vault-modules',
  setup(build) {
    build.onResolve({ filter: /utils\/(fileHandleStore|filePickers)\.js$/ }, args => ({
      path: path.join(here, 'src', `${/(fileHandleStore|filePickers)/.exec(args.path)[1]}.js`),
    }));
  },
};

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const result = await esbuild.build({
  entryPoints: [path.join(here, 'src', 'main.jsx')],
  outfile: path.join(outDir, 'main.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  // Obsidian provides these at runtime; bundling them would break the plugin.
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*', 'node:*'],
  define: {
    'process.env.NODE_ENV': '"production"',
    global: 'globalThis',
  },
  plugins: [viteUrlImports, vaultModules],
  minify: !argv.includes('--dev'),
  sourcemap: argv.includes('--dev') ? 'inline' : false,
  logLevel: 'info',
  metafile: true,
});

// esbuild writes the bundled CSS next to the JS. Scope it, append the
// plugin's own rules, and ship it under the name Obsidian loads.
const cssPath = path.join(outDir, 'main.css');
const appCss = await readFile(cssPath, 'utf8');
const pluginCss = await readFile(path.join(here, 'src', 'obsidian.css'), 'utf8');
await writeFile(path.join(outDir, 'styles.css'), `${scopeCss(appCss)}\n${pluginCss}`);
await rm(cssPath);

await writeFile(
  path.join(outDir, 'manifest.json'),
  await readFile(path.join(repo, 'manifest.json'), 'utf8'),
);

const js = result.metafile.outputs[path.relative(process.cwd(), path.join(outDir, 'main.js'))];
if (js) console.log(`main.js  ${(js.bytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`plugin → ${outDir}`);
