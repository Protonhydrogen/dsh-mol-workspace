import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, posix, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ID = 'dsh-mol-workspace';

/** Command that installs this clone's runtime dependencies where Node can see them. */
export const DEPENDENCY_INSTALL_COMMAND = 'npm install --omit=dev --legacy-peer-deps';

/** Runtime dependencies the plugin declares for its host half. */
export function pluginDependencies(pluginRoot) {
  const manifest = JSON.parse(readFileSync(resolve(pluginRoot, 'package.json'), 'utf8'));
  const dependencies = manifest.dependencies ?? {};
  if (typeof dependencies !== 'object' || Array.isArray(dependencies)) throw new Error('Plugin package.json must declare an object dependencies field.');
  return dependencies;
}

/**
 * Dependencies Node cannot resolve from the clone's own path.
 *
 * A `link:` install leaves the profile's node_modules holding only a symlink,
 * and DSH imports the host half through its real path, so the profile cannot
 * satisfy these. `createRequire(...).resolve.paths` is the same probe DSH's
 * runtime resolution uses, which keeps this check honest about what will work.
 */
export function unresolvedDependencies(pluginRoot, dependencies = pluginDependencies(pluginRoot)) {
  const requirement = createRequire(resolve(pluginRoot, 'package.json'));
  const unresolved = [];
  for (const name of Object.keys(dependencies).sort()) {
    const paths = requirement.resolve.paths(name) ?? [];
    const found = paths.some(base => existsSync(join(base, name, 'package.json')));
    if (!found) unresolved.push({ name, range: dependencies[name] });
  }
  return unresolved;
}

/** One-line-per-package diagnostic for a clone whose dependencies are not installed. */
export function dependencyWarning(pluginRoot, unresolved) {
  const listed = unresolved.map(({ name, range }) => `  - ${name} (${range})`).join('\n');
  return [
    'warning: this clone cannot resolve its own runtime dependencies:',
    listed,
    'DSH imports a linked bundle through the real path of this directory, so the profile node_modules cannot satisfy them,',
    'and the host half will fail to import (the sidebar then shows no panel).',
    `Run: cd "${resolve(pluginRoot)}" && ${DEPENDENCY_INSTALL_COMMAND}`,
    'The flags keep the peer dependencies DSH already provides out of this clone.',
  ].join('\n') + '\n';
}

export function linkRoot(pluginRoot, platform = process.platform) {
  if (platform === 'win32') return win32.resolve(pluginRoot).replaceAll('\\', '/');
  return posix.resolve(pluginRoot);
}

/** Pure, platform-selectable transformation of a DSH profile manifest. */
export function mergeProfile(manifest, pluginRoot, platform = process.platform) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Profile package.json must contain an object.');
  const dependencies = { ...(manifest.dependencies ?? {}) };
  dependencies[PLUGIN_ID] = 'link:' + linkRoot(pluginRoot, platform);
  const bundles = manifest.dsh?.profile?.bundles ?? [];
  if (!Array.isArray(bundles) || bundles.some(value => typeof value !== 'string')) throw new Error('dsh.profile.bundles must be a string array.');
  return {
    ...manifest,
    name: manifest.name ?? 'dsh-profile-molecular-workspace',
    private: true,
    dependencies,
    dsh: {
      ...(manifest.dsh ?? {}),
      profile: {
        ...(manifest.dsh?.profile ?? {}),
        bundles: [...new Set([...bundles, PLUGIN_ID])],
      },
    },
  };
}

export function readManifest(profileDir) {
  const path = resolve(profileDir, 'package.json');
  try {
    return { path, manifest: JSON.parse(readFileSync(path, 'utf8')), exists: true };
  } catch (error) {
    if (error?.code === 'ENOENT') return { path, manifest: {}, exists: false };
    if (error instanceof SyntaxError) throw new Error('Refusing to overwrite malformed profile package.json: ' + path);
    throw error;
  }
}

export function configureProfile({ profileDir, pluginRoot, write = false }) {
  const targetDir = resolve(profileDir);
  const root = resolve(pluginRoot);
  const source = readManifest(targetDir);
  const manifest = mergeProfile(source.manifest, root);
  const content = JSON.stringify(manifest, null, 2) + '\n';
  const previous = source.exists ? JSON.stringify(source.manifest, null, 2) + '\n' : null;
  const changed = content !== previous;
  if (write && changed) {
    mkdirSync(targetDir, { recursive: true });
    if (source.exists) {
      const backup = source.path + '.before-dsh-mol-workspace-' + process.pid;
      copyFileSync(source.path, backup, constants.COPYFILE_EXCL);
    }
    const temporary = source.path + '.tmp-' + process.pid;
    try {
      writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
      renameSync(temporary, source.path);
    } catch (error) {
      throw new Error('Profile update was not completed: ' + error.message);
    }
  }
  return { profileDir: targetDir, pluginRoot: root, changed, wrote: write && changed, dependency: manifest.dependencies[PLUGIN_ID], manifest };
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const remaining = args.filter(arg => arg !== '--write');
  if (remaining.length !== 2 || remaining[0] !== '--profile-dir') {
    console.error('Usage: node scripts/install-profile.mjs --profile-dir PATH [--write]');
    console.error('Preview by default. This only configures the plugin; it never changes DSH core or installs dependencies.');
    process.exitCode = 2;
    return;
  }
  const pluginRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const packageName = JSON.parse(readFileSync(resolve(pluginRoot, 'package.json'), 'utf8')).name;
  const clientIdentity = readFileSync(resolve(pluginRoot, 'src/client/index.js'), 'utf8').includes("ID='dsh-mol-workspace'");
  if (packageName !== PLUGIN_ID || !clientIdentity) throw new Error('Plugin identity mismatch.');
  const result = configureProfile({ profileDir: remaining[1], pluginRoot, write });
  const unresolved = unresolvedDependencies(pluginRoot);
  const dependencyStep = `Install this clone's runtime dependencies, or the host half will not import: cd "${pluginRoot}" && ${DEPENDENCY_INSTALL_COMMAND}`;
  const next = [
    'Install the profile dependencies with your existing DSH package manager',
    ...unresolved.length > 0 ? [dependencyStep] : [],
    'Fully restart DSH',
    'Open the right sidebar and choose Mol* Viewer',
  ];
  if (unresolved.length > 0) process.stderr.write(dependencyWarning(pluginRoot, unresolved));
  console.log(JSON.stringify({
    plugin: packageName,
    changed: result.changed,
    wrote: result.wrote,
    dependency: result.dependency,
    profileDir: result.profileDir,
    dependencies: { unresolved, install: unresolved.length > 0 ? DEPENDENCY_INSTALL_COMMAND : null },
    next,
  }, null, 2));
  // A written profile whose clone cannot resolve its own dependencies is not a usable install.
  if (write && unresolved.length > 0) process.exitCode = 1;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main();
