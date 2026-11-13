/**
 * Path resolution for the build and test scripts.
 *
 * Nothing here hard-codes an absolute path. Each root is taken from an
 * environment variable when set, then from the repository's own
 * node_modules (the `npm install` case), then from the local DSH profile.
 * If none of those exist the script stops with an error that says what to
 * install rather than failing somewhere deeper.
 *
 * A "root" here is a directory that CONTAINS a node_modules. That is the
 * one convention both createRequire and esbuild agree on.
 *
 *   MOLSTAR_ROOT  provides molstar + esbuild
 *   DSH_ROOT      provides the @deepseek-ai/* host packages
 *   DSH_MOL_BUILD_DIR  where build output goes (default: <repo>/.build)
 */
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURES = join(REPO, 'fixtures');
export const OUT_DIR = process.env.DSH_MOL_BUILD_DIR || join(REPO, '.build');

function firstExisting(candidates, label, hint) {
  for (const candidate of candidates) {
    if (candidate && existsSync(join(candidate, 'node_modules', label.split(' ')[0]))) return candidate;
  }
  throw new Error(
    `Cannot find ${label}.\n` +
      `Looked in: ${candidates.filter(Boolean).join(', ')}\n${hint}`,
  );
}

/** Directory whose node_modules provides `molstar` (and esbuild). */
export const MOLSTAR_ROOT = firstExisting(
  [process.env.MOLSTAR_ROOT, REPO, resolve(REPO, '..', 'molstar-build')],
  'molstar esbuild-toolchain',
  'Run `npm install` in this repository, or set MOLSTAR_ROOT to a directory whose node_modules contains molstar and esbuild.',
);

/** Directory whose node_modules provides the @deepseek-ai scope. */
export const DSH_ROOT = firstExisting(
  [
    process.env.DSH_ROOT,
    REPO,
    join(homedir(), '.dsh', 'profiles'),
    join(homedir(), '.dsh', 'profiles', 'desktop'),
  ],
  '@deepseek-ai host packages',
  'Install DeepSeek Harness, or set DSH_ROOT to the directory whose node_modules contains the @deepseek-ai scope.',
);

export const MOLSTAR_NODE_MODULES = join(MOLSTAR_ROOT, 'node_modules');
export const DSH_NODE_MODULES = join(DSH_ROOT, 'node_modules');
