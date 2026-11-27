import { constants, copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { posix, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ID = 'dsh-mol-workspace';

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
  console.log(JSON.stringify({ plugin: packageName, changed: result.changed, wrote: result.wrote, dependency: result.dependency, profileDir: result.profileDir, next: ['Install the profile dependencies with your existing DSH package manager', 'Fully restart DSH', 'Open the right sidebar and choose Mol* Viewer'] }, null, 2));
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main();
