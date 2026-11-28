import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { configureProfile, DEPENDENCY_INSTALL_COMMAND, dependencyWarning, linkRoot, mergeProfile, PLUGIN_ID, pluginDependencies, unresolvedDependencies } from '../scripts/install-profile.mjs';

test('POSIX and Windows paths produce native package-manager link specs', () => {
  assert.equal(linkRoot('/Users/researcher/My Plugins/dsh-mol-workspace', 'darwin'), '/Users/researcher/My Plugins/dsh-mol-workspace');
  assert.equal(linkRoot('/Users/researcher/dsh-mol-workspace', 'linux'), '/Users/researcher/dsh-mol-workspace');
  assert.equal(linkRoot('D:\\Research\\dsh-mol-workspace', 'win32'), 'D:/Research/dsh-mol-workspace');
});

test('profile merge preserves existing plugins, configuration and bundle entries', () => {
  const existing = { name: 'desktop', dependencies: { other: '1.0.0' }, dsh: { profile: { bundles: ['core', PLUGIN_ID], patchReload: 'live' }, client: { theme: 'dark' } }, custom: true };
  const next = mergeProfile(existing, '/opt/dsh-mol-workspace', 'darwin');
  assert.equal(next.dependencies.other, '1.0.0');
  assert.equal(next.dependencies[PLUGIN_ID], 'link:/opt/dsh-mol-workspace');
  assert.deepEqual(next.dsh.profile.bundles, ['core', PLUGIN_ID]);
  assert.equal(next.dsh.profile.patchReload, 'live');
  assert.equal(next.dsh.client.theme, 'dark');
  assert.equal(next.custom, true);
  assert.deepEqual(existing.dsh.profile.bundles, ['core', PLUGIN_ID]);
});

test('installer previews, creates a new profile safely, then is idempotent', () => {
  const temporary = mkdtempSync(join(process.cwd(), '.profile-install-test-'));
  try {
    const profileDir = join(temporary, 'mac-profile');
    const pluginRoot = process.cwd();
    const preview = configureProfile({ profileDir, pluginRoot });
    assert.equal(preview.wrote, false);
    assert.equal(preview.manifest.dependencies[PLUGIN_ID].startsWith('link:'), true);
    const created = configureProfile({ profileDir, pluginRoot, write: true });
    assert.equal(created.wrote, true);
    const stored = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'));
    assert.equal(stored.dsh.profile.bundles.filter(id => id === PLUGIN_ID).length, 1);
    const repeated = configureProfile({ profileDir, pluginRoot, write: true });
    assert.equal(repeated.changed, false);
    assert.equal(created.manifest.dependencies[PLUGIN_ID], preview.manifest.dependencies[PLUGIN_ID]);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('existing profile backup and custom settings survive an update', () => {
  const temporary = mkdtempSync(join(process.cwd(), '.profile-install-test-'));
  try {
    writeFileSync(join(temporary, 'package.json'), JSON.stringify({ dependencies: { keep: '1.0.0' }, dsh: { profile: { bundles: ['existing'], otherSetting: 42 } } }));
    const output = configureProfile({ profileDir: temporary, pluginRoot: process.cwd(), write: true });
    assert.equal(output.wrote, true);
    const updated = JSON.parse(readFileSync(join(temporary, 'package.json'), 'utf8'));
    assert.equal(updated.dependencies.keep, '1.0.0');
    assert.equal(updated.dsh.profile.otherSetting, 42);
    assert.deepEqual(updated.dsh.profile.bundles, ['existing', PLUGIN_ID]);
    const backup = JSON.parse(readFileSync(join(temporary, 'package.json.before-dsh-mol-workspace-' + process.pid), 'utf8'));
    assert.equal(backup.dependencies[PLUGIN_ID], undefined);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('a clone that cannot resolve its own dependencies is reported with the exact command', () => {
  const temporary = mkdtempSync(join(process.cwd(), '.profile-install-test-'));
  try {
    mkdirSync(join(temporary, 'node_modules', 'installed-dep'), { recursive: true });
    writeFileSync(join(temporary, 'node_modules', 'installed-dep', 'package.json'), JSON.stringify({ name: 'installed-dep', version: '1.0.0' }));
    writeFileSync(join(temporary, 'package.json'), JSON.stringify({
      name: 'fixture-plugin',
      dependencies: { 'installed-dep': '^1.0.0', 'missing-dep': '^2.0.0' },
    }));
    assert.deepEqual(pluginDependencies(temporary), { 'installed-dep': '^1.0.0', 'missing-dep': '^2.0.0' });
    assert.deepEqual(unresolvedDependencies(temporary), [{ name: 'missing-dep', range: '^2.0.0' }]);
    const warning = dependencyWarning(temporary, unresolvedDependencies(temporary));
    assert.match(warning, /missing-dep \(\^2\.0\.0\)/);
    assert.equal(warning.includes('installed-dep ('), false);
    assert.ok(warning.includes(DEPENDENCY_INSTALL_COMMAND));
    assert.ok(warning.includes(temporary));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('a clone whose dependencies are installed reports none unresolved', () => {
  const temporary = mkdtempSync(join(process.cwd(), '.profile-install-test-'));
  try {
    mkdirSync(join(temporary, 'node_modules', '@scope', 'resolved-dep'), { recursive: true });
    writeFileSync(join(temporary, 'node_modules', '@scope', 'resolved-dep', 'package.json'), JSON.stringify({ name: '@scope/resolved-dep', version: '3.0.0' }));
    writeFileSync(join(temporary, 'package.json'), JSON.stringify({ name: 'fixture-plugin', dependencies: { '@scope/resolved-dep': '^3.0.0' } }));
    assert.deepEqual(unresolvedDependencies(temporary), []);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('malformed profile is never overwritten', () => {
  const temporary = mkdtempSync(join(process.cwd(), '.profile-install-test-'));
  try {
    writeFileSync(join(temporary, 'package.json'), '{invalid');
    assert.throws(() => configureProfile({ profileDir: temporary, pluginRoot: process.cwd(), write: true }), /Refusing to overwrite/);
    assert.equal(readFileSync(join(temporary, 'package.json'), 'utf8'), '{invalid');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
