/**
 * Build the browser pieces the live tests need.
 *
 *   node tests/build.mjs
 *
 * Emits into OUT_DIR (default <repo>/.build):
 *   harness.js  the page harness the live test opens
 *   client.js   the plugin client, for comparison against the shipped bundle
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, OUT_DIR, MOLSTAR_ROOT, MOLSTAR_NODE_MODULES, portableModuleIds } from './paths.mjs';

const require = createRequire(join(MOLSTAR_ROOT, 'package.json'));
const { build } = require('esbuild');

const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
mkdirSync(OUT_DIR, { recursive: true });

for (const [entry, filename, production] of [
  ['tests/browser-entry.js', 'harness.js', false],
  ['src/client/index.js', 'client.js', true],
]) {
  const result = await build({
    absWorkingDir: MOLSTAR_ROOT,
    entryPoints: [join(REPO, entry)],
    bundle: true,
    format: production ? 'cjs' : 'iife',
    platform: 'browser',
    nodePaths: [MOLSTAR_NODE_MODULES],
    external: production ? ['react', 'react-dom', 'react/jsx-runtime'] : [],
    write: false,
    minifyWhitespace: production,
    legalComments: production ? 'eof' : 'inline',
    target: 'esnext',
    logLevel: 'warning',
  });
  const body = portableModuleIds(result.outputFiles[0].text);
  const output = production
    ? `window.__ModuleLoader__.load({id:'${pkg.name}',factory(require){var module={exports:{}};var exports=module.exports;\n${body}\nreturn module.exports;}});`
    : body;
  writeFileSync(join(OUT_DIR, filename), output, 'utf8');
  console.log(filename, Buffer.byteLength(output));
}
