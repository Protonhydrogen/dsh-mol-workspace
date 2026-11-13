/**
 * Build the publishable client bundle.
 *
 *   node build.mjs
 *
 * Emits `client.js`: the browser half of the plugin, a single UMD-ish file the
 * DSH web client loads through `window.__ModuleLoader__`. Mol* is bundled in, so
 * consumers do not need a Mol* build of their own.
 *
 * The bundle id is read from package.json so the emitted module id and the
 * package name can never drift apart.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, MOLSTAR_ROOT, MOLSTAR_NODE_MODULES } from './tests/paths.mjs';

const require = createRequire(join(MOLSTAR_ROOT, 'package.json'));
const { build } = require('esbuild');

const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
const outClient = join(REPO, 'client.js');

const result = await build({
  entryPoints: [join(REPO, 'src/client/index.js')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  nodePaths: [MOLSTAR_NODE_MODULES],
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  write: false,
  minify: false,
  target: 'esnext',
  logLevel: 'warning',
});

const body = result.outputFiles[0].text;
const wrapped = `window.__ModuleLoader__.load({id:'${pkg.name}',factory(require){var module={exports:{}};var exports=module.exports;\n${body}\nreturn module.exports;}});`;
writeFileSync(outClient, wrapped, 'utf8');
console.log('client.js', Buffer.byteLength(wrapped), 'bytes');
