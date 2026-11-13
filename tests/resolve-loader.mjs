/**
 * ESM loader used by the test scripts.
 *
 * The plugin imports Mol* with `molstar/lib/...` specifiers, but the published
 * package ships CommonJS under `lib/commonjs`. Node's own resolution does not
 * map those, and the plugin is not allowed to depend on React or on the DSH
 * host packages being resolvable from the repository. This hook supplies both,
 * resolving everything from the roots discovered in paths.mjs.
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MOLSTAR_NODE_MODULES, DSH_NODE_MODULES } from './paths.mjs';

const deps = createRequire(join(MOLSTAR_NODE_MODULES, '_'));
const dsh = createRequire(join(DSH_NODE_MODULES, '_'));

const MOLSTAR_LIB = join(MOLSTAR_NODE_MODULES, 'molstar', 'lib', 'commonjs');

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('molstar/lib/')) {
    const relative = specifier.slice('molstar/lib/'.length);
    const bare = join(MOLSTAR_LIB, relative);
    const path = bare.endsWith('.js') ? bare : existsSync(bare + '.js') ? bare + '.js' : join(bare, 'index.js');
    return next(pathToFileURL(path).href, context);
  }
  if (specifier === 'react' || specifier.startsWith('react-dom')) {
    return next(pathToFileURL(deps.resolve(specifier)).href, context);
  }
  if (specifier.startsWith('@deepseek-ai/') || specifier === 'zod') {
    return next(pathToFileURL(dsh.resolve(specifier)).href, context);
  }
  return next(specifier, context);
}
